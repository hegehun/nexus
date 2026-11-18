using NEXUS.Hardware.Models;
using NEXUS.Hardware.Services;

static void Assert(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

static HardwareDevice Device(string name, string type, string sensorName, string sensorType, float? value, string status = "Available") =>
    new(name, type, $"/{type}/{name}", [new SensorReading(sensorName, sensorType, value, $"/{type}/{name}/{sensorName}", status)]);

Assert(WindowsSystemInfoReader.ResolveWindowsEdition("Windows 10 Pro", "26200") == "Windows 11 Pro", "Windows 11 builds should override the stale Windows 10 registry product name.");
Assert(WindowsSystemInfoReader.ResolveWindowsEdition("Windows 10 Pro", "19045") == "Windows 10 Pro", "Windows 10 builds should keep their registry product name.");
Assert(WindowsSystemInfoReader.ResolveWindowsEdition("Windows Server 2019 Standard", "17763") == "Windows Server 2019 Standard", "Server product names should not be rewritten as Windows 11.");
Assert(WindowsSystemInfoReader.ResolveActivationStatus([1u]) == true, "Licensed Windows should report activated.");
Assert(WindowsSystemInfoReader.ResolveActivationStatus([0u]) == false, "Unlicensed Windows should report not activated.");
Assert(WindowsSystemInfoReader.ResolveActivationStatus([]) is null, "Missing licensing data should report unavailable.");
var personalizedThresholds = new DiagnosticThresholds(CpuWarning: 70, CpuCritical: 90);
Assert(personalizedThresholds.IsValid, "Recommended and user-adjusted threshold pairs should validate.");
Assert(!new DiagnosticThresholds(CpuWarning: 95, CpuCritical: 90).IsValid, "A warning threshold must stay below the critical threshold.");

var diagnostics = new DiagnosticsService();
var now = DateTimeOffset.UtcNow;
var normal = new[]
{
    Device("CPU", "Cpu", "CPU Package", "Temperature", 50),
    Device("GPU", "GpuNvidia", "GPU Core", "Temperature", 55),
    Device("RAM", "Memory", "Memory", "Load", 45),
    Device("SSD", "Storage", "Composite", "Temperature", 40)
};
var healthy = diagnostics.Evaluate(normal, now);
Assert(healthy.Health.Score == 100 && healthy.Health.CoveragePercent == 100, "All available nominal sensors should score 100 with full coverage.");
Assert(healthy.Events.Count == 0, "Nominal sensors should not create Guardian events.");
var personalized = new DiagnosticsService().Evaluate([Device("CPU", "Cpu", "CPU Package", "Temperature", 72), .. normal.Skip(1)], now.AddMilliseconds(250), personalizedThresholds);
var personalizedThresholdText = $"{personalizedThresholds.CpuWarning:0.0} °C";
Assert(personalized.Health.Status == "Warning" && personalized.Events.Single(e => e.IsActive).Message.Contains(personalizedThresholdText), "A saved user threshold should control both Health scoring and Guardian alerts.");
var noisyStorage = Device("SSD", "Storage", "Composite", "Temperature", 50) with
{
    Sensors = [
        new SensorReading("Composite", "Temperature", 50, "/Storage/SSD/Composite", "Available"),
        new SensorReading("Temperature 2", "Temperature", 109, "/Storage/SSD/Temperature 2", "Available")
    ]
};
var selectedStorage = diagnostics.Evaluate([.. normal.Where(d => d.Name != "SSD"), noisyStorage], now.AddMilliseconds(500));
Assert(selectedStorage.Health.Score == 100 && selectedStorage.Health.Status == "Good" && selectedStorage.Events.Count == 0, "A secondary sensor should not override the primary drive temperature shown in the UI.");
var thresholdStorage = Device("SPCC M.2 PCIe SSD", "Storage", "Warning Temperature", "Temperature", 99) with
{
    Sensors = [
        new SensorReading("Warning Temperature", "Temperature", 99, "/Storage/SPCC/Warning Temperature", "Available"),
        new SensorReading("Critical Temperature", "Temperature", 109, "/Storage/SPCC/Critical Temperature", "Available")
    ]
};
var thresholdOnly = diagnostics.Evaluate([.. normal.Where(d => d.Name != "SSD"), thresholdStorage], now.AddMilliseconds(750));
Assert(thresholdOnly.Health.Score == 100 && thresholdOnly.Health.Status == "Good" && thresholdOnly.Health.CoveragePercent == 75 && thresholdOnly.Events.Count == 0, "Storage warning and critical thresholds are not current temperature readings and must not create Health or Guardian alerts.");
var multipleDrives = diagnostics.Evaluate([
    .. normal.Where(d => d.Name != "SSD"),
    Device("SSD A", "Storage", "Composite", "Temperature", 72),
    Device("SSD B", "Storage", "Composite", "Temperature", 83)
], now.AddMilliseconds(900));
var activeDriveEvents = multipleDrives.Events.Where(e => e.IsActive && e.Device.StartsWith("SSD ", StringComparison.Ordinal)).ToArray();
Assert(activeDriveEvents.Length == 2 && activeDriveEvents.Select(e => e.Device).OrderBy(name => name).SequenceEqual(["SSD A", "SSD B"]) && activeDriveEvents.Single(e => e.Device == "SSD B").Severity == "Critical", "Each hot drive should maintain its own Guardian alert and severity.");
var expectedStorageExplanation = $"A figyelt meghajtók közül a legmagasabb aktuális hőmérséklet: {83.0:0.0} °C";
Assert(multipleDrives.Health.Reasons.Any(r => r.StartsWith("Háttértár:") && r.Contains(expectedStorageExplanation)), "Storage Health should explain that it uses the hottest current drive reading.");

var hotCpu = Device("CPU", "Cpu", "CPU Package", "Temperature", 87);
var warning = diagnostics.Evaluate([hotCpu, .. normal.Skip(1)], now.AddSeconds(1));
Assert(warning.Health.Score < 100, "A warning-level CPU temperature should lower Health.");
Assert(warning.Health.Status == "Warning", "A warning-level component should be visible in overall Health status.");
Assert(warning.Events.Count(e => e.IsActive && e.Severity == "Warning") == 1, "A warning should create one active event.");
var warningEvent = warning.Events.Single(e => e.IsActive);
var warningReadingText = $"{87.0:0.0} °C";
var warningThresholdText = $"{85.0:0.0} °C";
Assert(warningEvent.Message.Contains(warningReadingText) && warningEvent.Message.Contains(warningThresholdText), "Guardian warning messages should include the measured value, unit, and numeric threshold.");
var repeated = diagnostics.Evaluate([hotCpu, .. normal.Skip(1)], now.AddSeconds(2));
Assert(repeated.Events.Count(e => e.IsActive) == 1 && repeated.Events.Single(e => e.IsActive).StartedAt == now.AddSeconds(1), "Repeated samples should update, not duplicate, an active event.");
var criticalCpu = Device("CPU", "Cpu", "CPU Package", "Temperature", 96);
var critical = diagnostics.Evaluate([criticalCpu, .. normal.Skip(1)], now.AddSeconds(2.5));
Assert(critical.Health.Status == "Critical" && critical.Events.Single(e => e.IsActive).Severity == "Critical", "Critical readings should raise severity without creating a duplicate event.");

var cooled = diagnostics.Evaluate([Device("CPU", "Cpu", "CPU Package", "Temperature", 79), .. normal.Skip(1)], now.AddSeconds(3));
Assert(cooled.Events.Count(e => !e.IsActive && e.ResolvedAt == now.AddSeconds(3)) == 1, "Cooling below the hysteresis threshold should resolve the event.");
var renewed = diagnostics.Evaluate([hotCpu, .. normal.Skip(1)], now.AddSeconds(4));
var cpuCycles = renewed.Events.Where(e => e.Device == "CPU").ToArray();
Assert(cpuCycles.Count(e => e.IsActive) == 1 && cpuCycles.Count(e => !e.IsActive) == 1 && cpuCycles.Select(e => e.Id).Distinct().Count() == 2, "A new alert cycle should have a new event id and retain the resolved cycle.");
var noData = diagnostics.Evaluate([Device("CPU", "Cpu", "CPU Package", "Temperature", null, "Unavailable")], now.AddSeconds(4));
Assert(noData.Health.Score is null && noData.Health.Status == "InsufficientData" && noData.Health.CoveragePercent == 0, "Missing data should not produce a synthetic Health score.");

Console.WriteLine("Diagnostics checks passed: scoring, coverage, thresholds, deduplication, severity changes, resolution, and missing data.");
