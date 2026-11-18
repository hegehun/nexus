namespace NEXUS.Hardware.Models;

public sealed record HardwareSnapshot(
    DateTimeOffset Timestamp,
    string ComputerName,
    string OperatingSystem,
    string Architecture,
    int LogicalProcessorCount,
    WindowsSystemInfo WindowsInfo,
    IReadOnlyList<HardwareDevice> Devices,
    HealthReport Health,
    IReadOnlyList<GuardianEvent> GuardianEvents);

public sealed record HardwareDevice(
    string Name,
    string HardwareType,
    string Identifier,
    IReadOnlyList<SensorReading> Sensors);

public sealed record SensorReading(
    string Name,
    string SensorType,
    float? Value,
    string Identifier,
    string Status);

public sealed record HealthReport(int? Score, int CoveragePercent, string Status, IReadOnlyList<string> Reasons);

public sealed record GuardianEvent(
    string Id,
    string SensorIdentifier,
    string Device,
    string Sensor,
    string Severity,
    string Message,
    DateTimeOffset StartedAt,
    bool IsActive,
    DateTimeOffset? ResolvedAt);

public sealed record WindowsSystemInfo(
    string? WindowsEdition,
    string? WindowsVersion,
    string? Manufacturer,
    string? Model,
    string SystemType,
    double? UsableMemoryGb,
    bool? IsActivated,
    string? ModelSource = null);
