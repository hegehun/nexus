using System.Text.Json;
using NEXUS.Hardware.Models;

namespace NEXUS.Hardware.Services;

public sealed record DiagnosticThresholds(
    int CpuWarning = 85,
    int CpuCritical = 95,
    int GpuWarning = 85,
    int GpuCritical = 95,
    int MemoryWarning = 90,
    int MemoryCritical = 97,
    int StorageWarning = 70,
    int StorageCritical = 80)
{
    public static DiagnosticThresholds Recommended { get; } = new();

    public bool IsValid =>
        CpuWarning is >= 40 and <= 110 && CpuCritical > CpuWarning && CpuCritical <= 120 &&
        GpuWarning is >= 40 and <= 110 && GpuCritical > GpuWarning && GpuCritical <= 120 &&
        MemoryWarning is >= 50 and <= 99 && MemoryCritical > MemoryWarning && MemoryCritical <= 100 &&
        StorageWarning is >= 30 and <= 100 && StorageCritical > StorageWarning && StorageCritical <= 120;

    public static DiagnosticThresholds? ReadLocalSettings()
    {
        try
        {
            var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (string.IsNullOrWhiteSpace(localAppData)) return null;

            var path = Path.Combine(localAppData, "NEXUS", "diagnostic-thresholds.json");
            if (!File.Exists(path)) return null;

            var settings = JsonSerializer.Deserialize<DiagnosticThresholds>(
                File.ReadAllText(path), new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            return settings?.IsValid == true ? settings : null;
        }
        catch
        {
            return null;
        }
    }
}

/// <summary>Applies deterministic, conservative health and alert rules to live sensor readings.</summary>
public sealed class DiagnosticsService
{
    private readonly Dictionary<string, GuardianEvent> _activeEvents = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _activeEventCategories = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<GuardianEvent> _history = [];

    public (HealthReport Health, IReadOnlyList<GuardianEvent> Events) Evaluate(
        IReadOnlyList<HardwareDevice> devices, DateTimeOffset now, DiagnosticThresholds? thresholds = null)
    {
        var activeThresholds = thresholds?.IsValid == true ? thresholds : DiagnosticThresholds.Recommended;
        var cpu = devices.Where(d => d.HardwareType.Equals("Cpu", StringComparison.OrdinalIgnoreCase)).ToArray();
        var gpu = devices.Where(d => d.HardwareType.Contains("Gpu", StringComparison.OrdinalIgnoreCase)).ToArray();
        var memory = devices.Where(d => d.HardwareType.Equals("Memory", StringComparison.OrdinalIgnoreCase)).ToArray();
        var storage = devices.Where(d => d.HardwareType.Contains("Storage", StringComparison.OrdinalIgnoreCase)).ToArray();
        var parts = new List<(string Name, int Weight, int Score, string Explanation)>();
        var cpuReading = cpu.FirstOrDefault();
        var gpuReading = gpu.FirstOrDefault();
        var memoryReading = memory.FirstOrDefault(d => FindSensor(d, "Load", ["Memory", "Physical Memory", "Used Memory", "Total Memory"]) is not null)
            ?? memory.FirstOrDefault();
        AddTemperature(cpuReading is null ? [] : [cpuReading], "CPU", 30, activeThresholds.CpuWarning, activeThresholds.CpuCritical, ["CPU Package", "Core (Tctl/Tdie)", "CPU Core", "Core Max"], parts);
        AddTemperature(gpuReading is null ? [] : [gpuReading], "GPU", 25, activeThresholds.GpuWarning, activeThresholds.GpuCritical, ["GPU Core", "GPU Temperature", "GPU Hot Spot"], parts);
        AddLoad(memoryReading is null ? [] : [memoryReading], "Memory", 20, activeThresholds.MemoryWarning, activeThresholds.MemoryCritical, ["Memory", "Physical Memory", "Used Memory", "Total Memory"], parts);
        AddTemperature(storage, "Storage", 25, activeThresholds.StorageWarning, activeThresholds.StorageCritical, ["Composite", "Drive Temperature", "Temperature"], parts);

        var totalWeight = parts.Sum(p => p.Weight);
        int? score = totalWeight == 0 ? null : (int)Math.Round(parts.Sum(p => p.Score * p.Weight) / (double)totalWeight);
        var status = score is null ? "InsufficientData"
            : parts.Any(p => p.Score <= 35) || score < 60 ? "Critical"
            : parts.Any(p => p.Score < 100) || score < 85 ? "Warning"
            : "Good";
        var reasons = parts.Select(p => $"{p.Name}: {p.Score}/100; {p.Explanation}").ToArray();
        if (parts.Count < 4) reasons = reasons.Append("The score uses available CPU, GPU, memory, and storage sensors only.").ToArray();

        UpdateAlerts(cpuReading is null ? [] : [cpuReading], "CPU", "Temperature", "Temperature", activeThresholds.CpuWarning, activeThresholds.CpuCritical, ["CPU Package", "Core (Tctl/Tdie)", "CPU Core", "Core Max"], now);
        UpdateAlerts(gpuReading is null ? [] : [gpuReading], "GPU", "Temperature", "Temperature", activeThresholds.GpuWarning, activeThresholds.GpuCritical, ["GPU Core", "GPU Temperature", "GPU Hot Spot"], now);
        UpdateAlerts(storage, "Storage", "Temperature", "Temperature", activeThresholds.StorageWarning, activeThresholds.StorageCritical, ["Composite", "Drive Temperature", "Temperature"], now);
        UpdateAlerts(memoryReading is null ? [] : [memoryReading], "Memory", "Load", "Load", activeThresholds.MemoryWarning, activeThresholds.MemoryCritical, ["Memory", "Physical Memory", "Used Memory", "Total Memory"], now);

        // Keep recent resolved events for the Guardian history while preventing unbounded growth.
        _history.RemoveAll(e => !e.IsActive && e.ResolvedAt < now.AddDays(-1));
        var events = _history.OrderByDescending(e => e.StartedAt).Take(50).ToArray();
        return (new HealthReport(score, totalWeight, status, reasons), events);
    }

    private static void AddTemperature(IEnumerable<HardwareDevice> devices, string label, int weight, float warning, float critical, IReadOnlyList<string> names, List<(string Name, int Weight, int Score, string Explanation)> parts)
    {
        var values = devices.Select(d => FindSensor(d, "Temperature", names)?.Value).Where(v => v.HasValue).Select(v => v!.Value).ToArray();
        var value = values.DefaultIfEmpty(float.NaN).Max();
        if (!float.IsFinite(value)) return;
        var points = value >= critical ? 35 : value >= warning ? 70 : 100;
        var condition = points == 35 ? $"critical at or above {critical:0} °C" : points == 70 ? $"warning at or above {warning:0} °C" : $"below the {warning:0} °C warning threshold";
        var readingDescription = label.Equals("Storage", StringComparison.OrdinalIgnoreCase)
            ? "highest current temperature across monitored drives"
            : "current temperature";
        parts.Add((label, weight, points, $"{readingDescription} {value:0.0} °C, {condition}."));
    }

    private static void AddLoad(IEnumerable<HardwareDevice> devices, string label, int weight, float warning, float critical, IReadOnlyList<string> names, List<(string Name, int Weight, int Score, string Explanation)> parts)
    {
        var values = devices.Select(d => FindSensor(d, "Load", names)?.Value).Where(v => v.HasValue).Select(v => v!.Value).ToArray();
        var value = values.DefaultIfEmpty(float.NaN).Max();
        if (!float.IsFinite(value)) return;
        var points = value >= critical ? 35 : value >= warning ? 70 : 100;
        var condition = points == 35 ? $"critical at or above {critical:0}%" : points == 70 ? $"warning at or above {warning:0}%" : $"below the {warning:0}% warning threshold";
        parts.Add((label, weight, points, $"current load {value:0.0}%, {condition}."));
    }

    private void UpdateAlerts(IEnumerable<HardwareDevice> devices, string category, string sensorType, string kind, float warning, float critical, IReadOnlyList<string> names, DateTimeOffset now)
    {
        var current = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var readings = devices.Select(device => (Device: device, Sensor: FindSensor(device, sensorType, names))).Where(x => x.Sensor is not null).ToArray();
        foreach (var item in readings)
        {
            var device = item.Device;
            var sensor = item.Sensor!;
            if (sensor.Value is null || sensor.Status != "Available") continue;
            var value = sensor.Value!.Value;
            var severity = value >= critical ? "Critical" : value >= warning ? "Warning" : null;
            var key = sensor.Identifier;
            if (severity is not null)
            {
                current.Add(key);
                var unit = kind.Equals("Temperature", StringComparison.OrdinalIgnoreCase) ? " °C" : "%";
                var threshold = severity == "Critical" ? critical : warning;
                var message = $"{category} {sensor.Name}: {value:0.0}{unit}; {severity.ToLowerInvariant()} threshold is {threshold:0.0}{unit}.";
                if (!_activeEvents.TryGetValue(key, out var existing))
                {
                    var created = new GuardianEvent(Guid.NewGuid().ToString("N"), sensor.Identifier, device.Name, sensor.Name, severity, message, now, true, null);
                    _activeEvents[key] = created;
                    _activeEventCategories[key] = category;
                    _history.Add(created);
                }
                else if (existing.Severity != severity || existing.Message != message)
                {
                    var updated = existing with { Severity = severity, Message = message };
                    _activeEvents[key] = updated;
                    ReplaceHistoryEvent(updated);
                }
            }
        }

        foreach (var pair in _activeEvents.ToArray())
        {
            if (!_activeEventCategories.TryGetValue(pair.Key, out var eventCategory) || !eventCategory.Equals(category, StringComparison.OrdinalIgnoreCase)) continue;
            if (current.Contains(pair.Key)) continue;
            // Resolve only events for devices in this category; a 5-point margin prevents threshold flicker.
            var reading = readings.Select(r => r.Sensor).FirstOrDefault(s => s?.Identifier == pair.Key);
            if (reading?.Value is null || reading.Status != "Available" || reading.Value.Value < warning - 5)
            {
                var resolved = pair.Value with { IsActive = false, ResolvedAt = now };
                _activeEvents.Remove(pair.Key);
                _activeEventCategories.Remove(pair.Key);
                ReplaceHistoryEvent(resolved);
            }
        }
    }

    private static SensorReading? FindSensor(HardwareDevice device, string sensorType, IReadOnlyList<string> names)
    {
        var candidates = device.Sensors.Where(s => s.SensorType.Equals(sensorType, StringComparison.OrdinalIgnoreCase)
            && s.Value.HasValue && s.Status == "Available" && !IsThresholdSensor(s.Name)).ToArray();
        return candidates.FirstOrDefault(s => names.Any(name => s.Name.Equals(name, StringComparison.OrdinalIgnoreCase)))
            ?? candidates.FirstOrDefault(s => names.Any(name => s.Name.Contains(name, StringComparison.OrdinalIgnoreCase)));
    }

    private static bool IsThresholdSensor(string name) =>
        name.Contains("Warning", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("Critical", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("Threshold", StringComparison.OrdinalIgnoreCase);

    private void ReplaceHistoryEvent(GuardianEvent updated)
    {
        var index = _history.FindIndex(e => e.Id == updated.Id);
        if (index >= 0) _history[index] = updated;
    }
}
