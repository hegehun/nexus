using System.Globalization;
using System.Management;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using NEXUS.Hardware.Models;

namespace NEXUS.Hardware.Services;

public static class WindowsSystemInfoReader
{
    private const string WindowsVersionKey = @"SOFTWARE\Microsoft\Windows NT\CurrentVersion";
    private const string BiosInfoKey = @"HARDWARE\DESCRIPTION\System\BIOS";

    public static WindowsSystemInfo Read()
    {
        var edition = ResolveWindowsEdition(ReadRegistryValue(WindowsVersionKey, "ProductName"), ReadRegistryValue(WindowsVersionKey, "CurrentBuildNumber"));
        var displayVersion = ReadRegistryValue(WindowsVersionKey, "DisplayVersion")
            ?? ReadRegistryValue(WindowsVersionKey, "ReleaseId");
        var buildNumber = ReadRegistryValue(WindowsVersionKey, "CurrentBuildNumber");
        var revision = ReadRegistryValue(WindowsVersionKey, "UBR");
        var build = string.IsNullOrWhiteSpace(buildNumber)
            ? null
            : $"Build {buildNumber}{(string.IsNullOrWhiteSpace(revision) ? "" : $".{revision}")}";
        var version = string.Join(" · ", new[] { displayVersion, build }.Where(value => !string.IsNullOrWhiteSpace(value)));
        if (string.IsNullOrWhiteSpace(version)) version = RuntimeInformation.OSDescription;

        var manufacturer = ReadRegistryValue(BiosInfoKey, "SystemManufacturer");
        var model = ReadRegistryValue(BiosInfoKey, "SystemProductName");
        var osBitness = Environment.Is64BitOperatingSystem ? "64-bit" : "32-bit";
        var processorArchitecture = RuntimeInformation.ProcessArchitecture switch
        {
            Architecture.X64 => "x64",
            Architecture.X86 => "x86",
            Architecture.Arm64 => "ARM64",
            Architecture.Arm => "ARM",
            _ => RuntimeInformation.ProcessArchitecture.ToString()
        };
        var systemType = $"{osBitness} operating system, {processorArchitecture}-based processor";

        return new WindowsSystemInfo(edition, version, manufacturer, model, systemType, ReadUsableMemoryGb(), ReadIsActivated());
    }

    public static string? ResolveWindowsEdition(string? registryProductName, string? buildNumber)
    {
        if (string.IsNullOrWhiteSpace(registryProductName)) return null;
        const string windows10Prefix = "Windows 10";
        if (registryProductName.StartsWith(windows10Prefix, StringComparison.OrdinalIgnoreCase) &&
            int.TryParse(buildNumber, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var build) &&
            build >= 22000)
            return $"Windows 11{registryProductName[windows10Prefix.Length..]}";
        return registryProductName;
    }

    public static bool? ResolveActivationStatus(IEnumerable<uint> licenseStatuses)
    {
        var statuses = licenseStatuses.ToArray();
        return statuses.Length == 0 ? null : statuses.Contains(1u);
    }

    private static bool? ReadIsActivated()
    {
        if (!OperatingSystem.IsWindows()) return null;
        try
        {
            const string windowsApplicationId = "55c92734-d682-4d71-983e-d6ec3f16059f";
            using var searcher = new ManagementObjectSearcher(
                $@"SELECT LicenseStatus FROM SoftwareLicensingProduct WHERE ApplicationID = '{windowsApplicationId}' AND PartialProductKey IS NOT NULL AND LicenseIsAddon = FALSE");
            using var products = searcher.Get();
            var statuses = new List<uint>();
            foreach (ManagementObject product in products)
            {
                var status = product["LicenseStatus"];
                if (status is not null) statuses.Add(Convert.ToUInt32(status, CultureInfo.InvariantCulture));
            }
            return ResolveActivationStatus(statuses);
        }
        catch
        {
            return null;
        }
    }

    private static string? ReadRegistryValue(string keyPath, string valueName)
    {
        if (!OperatingSystem.IsWindows()) return null;
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(keyPath);
            var value = key?.GetValue(valueName)?.ToString()?.Trim();
            if (string.IsNullOrWhiteSpace(value)) return null;
            if (value.Contains("to be filled", StringComparison.OrdinalIgnoreCase) ||
                value.Equals("default string", StringComparison.OrdinalIgnoreCase) ||
                value.Equals("system product name", StringComparison.OrdinalIgnoreCase) ||
                value.Equals("system manufacturer", StringComparison.OrdinalIgnoreCase)) return null;
            return value;
        }
        catch
        {
            return null;
        }
    }

    private static double? ReadUsableMemoryGb()
    {
        if (!OperatingSystem.IsWindows()) return null;
        var memory = new MemoryStatusEx { Length = (uint)Marshal.SizeOf<MemoryStatusEx>() };
        if (!GlobalMemoryStatusEx(ref memory) || memory.TotalPhysicalBytes == 0) return null;
        return Math.Round(memory.TotalPhysicalBytes / 1024d / 1024d / 1024d, 1);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatusEx
    {
        public uint Length;
        public uint MemoryLoad;
        public ulong TotalPhysicalBytes;
        public ulong AvailablePhysicalBytes;
        public ulong TotalPageFileBytes;
        public ulong AvailablePageFileBytes;
        public ulong TotalVirtualBytes;
        public ulong AvailableVirtualBytes;
        public ulong AvailableExtendedVirtualBytes;
    }

    [DllImport("kernel32.dll", SetLastError = true, ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref MemoryStatusEx memoryStatus);
}