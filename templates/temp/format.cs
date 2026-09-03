// Scratch — edit freely. `temp/` is git-ignored (and excluded from every project's globs).
// Run as a file-based app (.NET 10+):  dotnet run temp/format.cs
using System.Net.Http.Json;
using System.Text.Json;

var baseUrl = Environment.GetEnvironmentVariable("BASE_URL") ?? "http://localhost:5000";
using var http = new HttpClient();

var health = await http.GetFromJsonAsync<JsonElement>($"{baseUrl}/health");
Console.WriteLine(JsonSerializer.Serialize(health, new JsonSerializerOptions { WriteIndented = true }));
