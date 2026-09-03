# syntax=docker/dockerfile:1

# ---- build ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
# Restore first (cached layer): only the files that affect dependency resolution.
COPY global.json Directory.Build.props ./
COPY src/Api/Api.csproj src/Api/
RUN dotnet restore src/Api/Api.csproj
COPY . .
RUN dotnet publish src/Api/Api.csproj -c Release -o /app --no-restore

# ---- runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
COPY --from=build /app .
EXPOSE 8080
# Non-root: the official images define APP_UID (1654).
USER $APP_UID

# The aspnet image ships neither curl nor wget, so the app probes itself:
# `dotnet Api.dll --healthcheck` GETs /health on ASPNETCORE_HTTP_PORTS and exits 0/1
# (see Program.cs). Orchestrator liveness/readiness probes can target GET /health directly.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["dotnet", "Api.dll", "--healthcheck"]

ENTRYPOINT ["dotnet", "Api.dll"]
