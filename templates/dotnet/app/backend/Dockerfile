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

# No HEALTHCHECK here — the aspnet image ships neither curl nor wget. Point the
# orchestrator's liveness/readiness probe at GET /health instead.
ENTRYPOINT ["dotnet", "Api.dll"]
