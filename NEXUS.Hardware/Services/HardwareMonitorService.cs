using System.Runtime.InteropServices;
using LibreHardwareMonitor.Hardware;
using NEXUS.Hardware.Models;

namespace NEXUS.Hardware.Services;

public sealed class HardwareMonitorService : IDisposable
{
    private readonly Computer _computer = new()
    {
        IsCpuEnabled = true,
        IsGpuEnabled = true,
        IsMemoryEnabled = true,
        IsMotherboardEnabled = true,
        IsStorageEnabled = true,
        IsNetworkEnabled = true,
        IsControllerEnabled = true
    };

    private bool _started;
    private readonly DiagnosticsService _diagnostics = new();
    private readonly WindowsSystemInfo _systemInfo = WindowsSystemInfoReader.Read();
    private readonly Dictionary<string, IControl> _softwareControlledSensors = new(StringComparer.Ordinal);

    public void Start()
    {
        if (_started) return;
        _computer.Open();
        _started = true;
    }

    public HardwareSnapshot ReadSnapshot()
    {
        if (!_started)
            throw new InvalidOperationException("A hardverfigyelő még nincs elindítva.");

        var devices = new List<HardwareDevice>();

        foreach (var hardware in _computer.Hardware)
        {
            UpdateRecursively(hardware);
            CollectRecursively(hardware, devices);
        }

        var now = DateTimeOffset.UtcNow;
        var diagnostics = _diagnostics.Evaluate(devices, now, DiagnosticThresholds.ReadLocalSettings());
        return new HardwareSnapshot(now, Environment.MachineName, RuntimeInformation.OSDescription, RuntimeInformation.OSArchitecture.ToString(), Environment.ProcessorCount, _systemInfo, devices, diagnostics.Health, diagnostics.Events);
    }

    private static void UpdateRecursively(IHardware hardware)
    {
        hardware.Update();
        foreach (var child in hardware.SubHardware)
            UpdateRecursively(child);
    }

    private static void CollectRecursively(IHardware hardware, List<HardwareDevice> devices)
    {
        devices.Add(ReadHardware(hardware));
        foreach (var child in hardware.SubHardware)
            CollectRecursively(child, devices);
    }

    private static HardwareDevice ReadHardware(IHardware hardware)
    {
        var sensors = hardware.Sensors.Select(sensor =>
        {
            float? value = sensor.Value;
            var status = "Available";
            if (value.HasValue && (!float.IsFinite(value.Value) || !IsPlausible(sensor.SensorType, sensor.Name, value.Value)))
            {
                value = null;
                status = "Invalid";
            }
            else if (!value.HasValue)
            {
                status = "Unavailable";
            }

            var control = sensor.Control;
            var canControl = sensor.SensorType == SensorType.Control &&
                control is not null &&
                float.IsFinite(control.MinSoftwareValue) &&
                float.IsFinite(control.MaxSoftwareValue) &&
                control.MaxSoftwareValue > control.MinSoftwareValue;

            return new SensorReading(
                sensor.Name,
                sensor.SensorType.ToString(),
                value,
                sensor.Identifier.ToString(),
                status,
                canControl,
                canControl ? control!.MinSoftwareValue : null,
                canControl ? control!.MaxSoftwareValue : null,
                canControl ? control!.ControlMode.ToString() : null);
        }).ToArray();

        return new HardwareDevice(
            hardware.Name,
            hardware.HardwareType.ToString(),
            hardware.Identifier.ToString(),
            sensors);
    }

    private static bool IsPlausible(SensorType type, string name, float value)
    {
        if (type == SensorType.Temperature &&
            (name.Contains("Warning", StringComparison.OrdinalIgnoreCase) ||
             name.Contains("Critical", StringComparison.OrdinalIgnoreCase) ||
             name.Contains("Threshold", StringComparison.OrdinalIgnoreCase)))
            return false;

        return type switch
        {
            SensorType.Temperature => value is >= -20 and <= 150,
            SensorType.Load or SensorType.Control or SensorType.Level => value is >= 0 and <= 100,
            SensorType.Voltage => value is >= 0 and <= 100,
            SensorType.Power => value is >= 0 and <= 2000,
            SensorType.Fan => value is >= 0 and <= 100000,
            _ => true
        };
    }

    public (bool Success, string Message) SetSoftwareControl(string identifier, float? value)
    {
        if (!_started) return (false, "A hardverfigyelő nincs elindítva.");
        var sensor = FindSensor(_computer.Hardware, identifier);
        var control = sensor?.Control;
        if (sensor?.SensorType != SensorType.Control || control is null)
            return (false, "Ez a hardvercsatorna nem vezérelhető a NEXUS hardver-backendjével.");

        if (value is null)
        {
            control.SetDefault();
            _softwareControlledSensors.Remove(identifier);
            return (true, "A hardver alapértelmezett vezérlése visszaállítva.");
        }

        if (!float.IsFinite(value.Value) || value.Value < control.MinSoftwareValue || value.Value > control.MaxSoftwareValue)
            return (false, $"Az érték kívül esik az engedélyezett {control.MinSoftwareValue:0.#}–{control.MaxSoftwareValue:0.#}% tartományon.");

        control.SetSoftware(value.Value);
        _softwareControlledSensors[identifier] = control;
        return (true, $"Vezérlés beállítva: {value.Value:0.#}%.");
    }

    private static ISensor? FindSensor(IEnumerable<IHardware> hardwareList, string identifier)
    {
        foreach (var hardware in hardwareList)
        {
            var sensor = hardware.Sensors.FirstOrDefault(item => item.Identifier.ToString() == identifier);
            if (sensor is not null) return sensor;
            var childSensor = FindSensor(hardware.SubHardware, identifier);
            if (childSensor is not null) return childSensor;
        }
        return null;
    }

    public void Dispose()
    {
        if (!_started) return;
        foreach (var control in _softwareControlledSensors.Values)
        {
            try { control.SetDefault(); }
            catch { /* A device may have disconnected while the app was closing. */ }
        }
        _softwareControlledSensors.Clear();
        _computer.Close();
        _started = false;
    }
}
