# {{PROJECT_NAME}}

<!-- {{BADGES}} -->
> One-line description of what this project does.

## Features

- …
- …

## Getting started

### Prerequisites

- .NET SDK (version pinned in `global.json`; `rollForward: latestFeature`)

### Install

```bash
dotnet tool restore                          # local tools (versionize)
git config core.hooksPath .githooks          # dotnet format + Conventional Commit hooks
dotnet restore
```

### Develop

```bash
dotnet run --project src/Api                 # minimal API starter → http://localhost:5000/health
dotnet watch --project src/Api               # hot reload
```

## Tasks

| Command                              | Description                                    |
| ------------------------------------ | ---------------------------------------------- |
| `dotnet build`                       | Build (warnings are errors, analyzers enforced) |
| `dotnet format`                      | Fix formatting + code style (`.editorconfig`)   |
| `dotnet format --verify-no-changes`  | Check formatting (what CI runs)                 |
| `dotnet test`                        | Run tests (xUnit) with coverage collection      |
| `dotnet versionize --changelog-all`  | Release: bump `<Version>` + CHANGELOG (from main) |

## Contributing

See [CONTRIBUTING]({{CONTRIBUTING_PATH}}). Commits follow
[Conventional Commits](https://www.conventionalcommits.org/); releases are
automated with {{RELEASE_TOOL}}.

## Security

See [SECURITY]({{SECURITY_PATH}}) for how to report vulnerabilities.

## License

<!-- e.g. MIT © Year Author -->
