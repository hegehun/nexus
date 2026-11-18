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
        IsNetworkEnabled = true
    };

    private bool _started;
    private readonly DiagnosticsService _diagnostics = new();
    private readonly WindowsSystemInfo _systemInfo = WindowsSystemInfoReader.Read();

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
        var sensors = hardware.Sensors.Where(sensor => sensor.SensorType != SensorType.Control).Select(sensor =>
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

            return new SensorReading(
                sensor.Name,
                sensor.SensorType.ToString(),
                value,
                sensor.Identifier.ToString(),
                status);
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
            SensorType.Load or SensorType.Level => value is >= 0 and <= 100,
            SensorType.Voltage => value is >= 0 and <= 100,
            SensorType.Power => value is >= 0 and <= 2000,
            SensorType.Fan => value is >= 0 and <= 100000,
            _ => true
        };
    }

    public void Dispose()
    {
        if (!_started) return;
        _computer.Close();
        _started = false;
    }
}
