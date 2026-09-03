using System.Diagnostics;
using System.Reflection;

// `dotnet Api.dll --healthcheck` probes a running instance and exits 0/1. The Dockerfile
// HEALTHCHECK uses it because the aspnet runtime image ships neither curl nor wget.
if (args.Contains("--healthcheck"))
{
    return await HealthProbe.RunAsync();
}

var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

// Version comes from <Version> in Directory.Build.props (bumped by the release tooling);
// strip the "+<commit>" suffix that CI builds append.
var version = Assembly.GetEntryAssembly()
    ?.GetCustomAttribute<AssemblyInformationalVersionAttribute>()
    ?.InformationalVersion.Split('+')[0] ?? "unknown";
var uptime = Stopwatch.StartNew();

// GET /health → { status, version, uptime } — the same shape as the devkit Node and Python starters.
app.MapGet("/health", () => Results.Ok(
    new HealthResponse("ok", version, Math.Round(uptime.Elapsed.TotalSeconds, 3))));

await app.RunAsync();
return 0;

internal sealed record HealthResponse(string Status, string Version, double Uptime);

internal static class HealthProbe
{
    public static async Task<int> RunAsync()
    {
        // Same port the container listens on (ASPNETCORE_HTTP_PORTS in the Dockerfile).
        var port = (Environment.GetEnvironmentVariable("ASPNETCORE_HTTP_PORTS") ?? "8080").Split(';')[0];
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
        try
        {
            using var response = await http.GetAsync(new Uri($"http://localhost:{port}/health"));
            return response.IsSuccessStatusCode ? 0 : 1;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return 1;
        }
    }
}

// Makes the implicit Program class visible to WebApplicationFactory<Program> in the test project.
public partial class Program;
