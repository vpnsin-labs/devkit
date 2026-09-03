using System.Diagnostics;
using System.Reflection;

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

app.Run();

internal sealed record HealthResponse(string Status, string Version, double Uptime);

// Makes the implicit Program class visible to WebApplicationFactory<Program> in the test project.
public partial class Program;
