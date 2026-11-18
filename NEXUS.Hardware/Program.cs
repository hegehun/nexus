using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using NEXUS.Hardware.Services;

Console.OutputEncoding = Encoding.UTF8;

using var monitor = new HardwareMonitorService();
using var shutdown = new CancellationTokenSource();

Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    shutdown.Cancel();
};

var options = new JsonSerializerOptions
{
    WriteIndented = false,
    DefaultIgnoreCondition = JsonIgnoreCondition.Never
};
options.Converters.Add(new NullableFiniteSingleConverter());

_ = Task.Run(async () =>
{
    while (!shutdown.IsCancellationRequested)
    {
        var line = await Console.In.ReadLineAsync();
        if (line is null) break;
        try
        {
            using var message = JsonDocument.Parse(line);
            if (message.RootElement.TryGetProperty("action", out var action) &&
                string.Equals(action.GetString(), "shutdown", StringComparison.OrdinalIgnoreCase))
                shutdown.Cancel();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Invalid hardware command: {ex.Message}");
        }
    }
});

var intervalMs = 1000;
if (args.Length > 0 && int.TryParse(args[0], out var requested))
    intervalMs = Math.Clamp(requested, 250, 10000);

try
{
    // All diagnostics go to stderr. stdout is reserved for JSON Lines only.
    Console.Error.WriteLine("NEXUS hardware engine starting...");
    monitor.Start();
    Console.Error.WriteLine($"Hardware monitoring active. Interval: {intervalMs} ms");

    while (!shutdown.IsCancellationRequested)
    {
        if (shutdown.IsCancellationRequested) break;

        var snapshot = monitor.ReadSnapshot();
        var json = JsonSerializer.Serialize(snapshot, options);

        // Exactly one complete compact JSON object per line.
        Console.Out.WriteLine(json);
        Console.Out.Flush();

        try
        {
            await Task.Delay(intervalMs, shutdown.Token);
        }
        catch (OperationCanceledException)
        {
            break;
        }
    }
}
catch (Exception ex)
{
    Console.Error.WriteLine($"NEXUS hardware engine error: {ex}");
    Environment.ExitCode = 1;
}
finally
{
    Console.Error.WriteLine("NEXUS hardware engine stopped.");
}

sealed class NullableFiniteSingleConverter : JsonConverter<float?>
{
    public override float? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        var value = reader.GetSingle();
        return float.IsFinite(value) ? value : null;
    }

    public override void Write(Utf8JsonWriter writer, float? value, JsonSerializerOptions options)
    {
        if (value is null || !float.IsFinite(value.Value))
            writer.WriteNullValue();
        else
            writer.WriteNumberValue(value.Value);
    }
}
