# .NET repos — `devkit init --dotnet`

devkit brings its conventions to .NET without adding Node or Python to the
repo: a pinned SDK, repo-wide analyzers with warnings-as-errors, `.editorconfig`
code style enforced at build time and fixed by `dotnet format`, plain git hooks
for formatting and Conventional Commits, a CI gate, and Conventional-Commit
releases (release-please on GitHub, versionize on Azure Repos). Only the
one-time `npx devkit init` needs Node.

```bash
# existing solution/project (*.sln, *.slnx, *.csproj, global.json detected)
npx devkit init            # or: npx devkit init --dotnet

# brand-new ASP.NET Core minimal API in an empty directory
mkdir payments-api && cd payments-api
npx devkit init --dotnet --backend
```

Add `--azure` for Azure Repos (see [Azure DevOps guide](azure-devops.md)),
`--private` for a private GitHub repo, `--sonar`, `--skills`, `--force`,
`--no-install`. Node-only flags are rejected.

---

## Contents

- [What gets scaffolded](#what-gets-scaffolded)
- [Directory.Build.props](#directorybuildprops)
- [Code style (.editorconfig + dotnet format)](#code-style-editorconfig--dotnet-format)
- [Git hooks](#git-hooks)
- [Minimal API starter (`--backend`)](#minimal-api-starter---backend)
- [CI](#ci)
- [Releases](#releases)
- [Dependency updates & security](#dependency-updates--security)
- [Adopting in an existing repo](#adopting-in-an-existing-repo)
- [Customising](#customising)

---

## What gets scaffolded

| File                                           | Purpose                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `global.json`                                  | SDK pin (`10.0.100`, `rollForward: latestFeature`) — CI installs exactly this line                                                                                                                                                                                    |
| `Directory.Build.props`                        | Repo-wide `<Version>`, nullable, implicit usings, warnings-as-errors, analyzers, deterministic/CI builds                                                                                                                                                              |
| `.editorconfig`                                | Base rules + C# formatting, style and naming rules (4-space `*.cs`)                                                                                                                                                                                                   |
| `.githooks/pre-commit`, `.githooks/commit-msg` | `dotnet format` on staged `*.cs` (re-staged); Conventional Commit check — no Node/Python needed                                                                                                                                                                       |
| `.config/dotnet-tools.json`                    | Local tool manifest: `versionize` (release bumps) — `dotnet tool restore`                                                                                                                                                                                             |
| `.gitignore`                                   | `bin/`, `obj/`, `.vs/`, `TestResults/`, `.env`, `temp/`                                                                                                                                                                                                               |
| `.vscode/settings.json`, `extensions.json`     | C# Dev Kit, format-on-save, per-language formatters; recommended extensions                                                                                                                                                                                           |
| `.markdownlint-cli2.jsonc`, `cspell.json`      | Docs lint + spell check                                                                                                                                                                                                                                               |
| `temp/format.cs` (+ common scratch files)      | Git-ignored scratch; `dotnet run temp/format.cs` (file-based app, .NET 10)                                                                                                                                                                                            |
| CI + governance                                | GitHub: `ci.yml` (.NET variant), CodeQL `csharp` (`build-mode: none`), Dependabot `nuget`, release-please (`simple` + XML updater), PR/issue templates, `CONTRIBUTING.md`. Azure: `azure-pipelines.yml` (.NET), release (versionize), security, Renovate, PR template |

All files are copied templates; re-sync with `npx devkit init --dotnet --force`.

## Directory.Build.props

MSBuild imports `Directory.Build.props` into every project beneath it, so one file
sets the baseline for the whole repo (a project's own `.csproj` can still override
any property):

| Property                                                         | Effect                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `<Version>0.1.0</Version>`                                       | Single source of truth for the version; bumped by release-please / versionize     |
| `LangVersion=latest`, `Nullable=enable`, `ImplicitUsings=enable` | Modern C# defaults                                                                |
| `TreatWarningsAsErrors=true`                                     | Compiler **and analyzer** warnings fail the build                                 |
| `EnforceCodeStyleInBuild=true`                                   | `.editorconfig` style rules (IDExxxx) are reported by the build, not just the IDE |
| `AnalysisLevel=latest-recommended`                               | .NET code-quality analyzers (CAxxxx) at the recommended level                     |
| `GenerateDocumentationFile=true` + `NoWarn CS1591`               | Needed for IDE0005 (unused usings) to run in build; missing-doc warnings are off  |
| `Deterministic`, `ContinuousIntegrationBuild` on CI              | Reproducible binaries; SourceLink-friendly                                        |
| `DefaultItemExcludes … temp/**`                                  | Keeps the scratch folder out of every project's globs                             |

## Code style (.editorconfig + dotnet format)

`.editorconfig` carries devkit's base rules (LF, UTF-8, final newline, 2-space
default) plus the .NET section: 4 spaces for C#, `dotnet_*`/`csharp_*` style
preferences (file-scoped namespaces, braces always, `var`, expression bodies where
they fit, System usings first, outside the namespace), formatting (IDE0055) and
naming (PascalCase types/members, `I` interfaces, `_camelCase` private fields).

Rules marked `:warning` become **build errors** through `TreatWarningsAsErrors`;
`:suggestion` rules show in the IDE and are applied by `dotnet format` without
failing the build. Tune severities in `.editorconfig`, or turn a rule off with
`dotnet_diagnostic.<ID>.severity = none`.

```bash
dotnet format                        # fix everything (whitespace, style, analyzers)
dotnet format --verify-no-changes    # what CI runs
```

## Git hooks

Plain POSIX `sh` hooks in `.githooks/` (Git for Windows runs them too), enabled per
clone with `git config core.hooksPath .githooks` (`devkit init` does this when run
inside a git repo).

- **pre-commit** — runs `dotnet format --include <staged .cs files>` and re-stages
  them, the `lint-staged` behaviour.
- **commit-msg** — regex check for `<type>[(scope)][!]: description` with the
  Conventional Commit types; merge/revert/fixup subjects are allowed. The same
  prefixes drive the release tooling.

`git commit --no-verify` bypasses both in an emergency; CI still verifies.

## Minimal API starter (`--backend`)

```text
<ProjectName>.slnx                     XML solution (SDK 9.0.200+): src/, tests/, solution items
src/Api/Api.csproj                     Microsoft.NET.Sdk.Web, net10.0, no packages needed
src/Api/Program.cs                     GET /health → { status, version, uptime } (same shape as Node/Python)
src/Api/appsettings*.json, Properties/launchSettings.json   http://localhost:5000
tests/Api.Tests/                       xUnit + WebApplicationFactory<Program> + coverlet
Dockerfile, .dockerignore              sdk:10.0 build → aspnet:10.0 runtime, non-root (APP_UID), port 8080
```

```bash
dotnet run --project src/Api          # http://localhost:5000/health
dotnet test
docker build -t payments-api . && docker run -p 8080:8080 payments-api
```

The `version` reported by `/health` is the assembly's informational version, i.e.
`<Version>` from `Directory.Build.props` (CI builds append `+<sha>`, which is
stripped). The aspnet image has no `curl`/`wget`, so the Dockerfile has no
`HEALTHCHECK` — point the orchestrator's probe at `/health`.

## CI

**GitHub Actions** (`ci.yml`, .NET variant): `setup-dotnet` from `global.json` →
`dotnet restore` → `dotnet list package --vulnerable` (non-blocking) →
`dotnet build -c Release` → `dotnet format --verify-no-changes` → markdownlint →
`dotnet test` with TRX + Cobertura coverage. CodeQL uses `languages: csharp` with
`build-mode: none` (no build required). `--sonar` scaffolds the
`dotnet-sonarscanner begin/build/test/end` workflow that C# needs (the generic
Sonar action cannot analyse compiled languages).

**Azure Pipelines** (`azure-pipelines.yml`, .NET variant): `UseDotNet@2` with
`useGlobalJson`, NuGet cache, the same gates, `PublishTestResults@2` (TRX) and
`PublishCodeCoverageResults@2`. See the [Azure DevOps guide](azure-devops.md).

## Releases

- **GitHub** — release-please has no .NET release type, so devkit uses
  `release-type: simple` (version tracked in `.release-please-manifest.json`) with
  an `extra-files` XML updater that bumps `<Version>` in `Directory.Build.props`.
  Merging the release PR writes `CHANGELOG.md`, `version.txt`, and creates the
  tag + release.
- **Azure Repos** — `.azuredevops/pipelines/release.yml` runs
  [`versionize`](https://github.com/versionize/versionize) (`dotnet versionize
--changelog-all`): it bumps every `<Version>` it finds, writes `CHANGELOG.md`,
  commits `chore(release): X.Y.Z`, tags `vX.Y.Z` and the pipeline pushes. Run it
  manually from `main` (parameters: release-as, dry run).

Keep `<Version>` only in `Directory.Build.props` so both tools have one place to
update; remove `<Version>` from individual `.csproj` files.

## Dependency updates & security

GitHub: Dependabot (`nuget` + `github-actions`, weekly, minor/patch grouped), CodeQL,
Trivy, Dependency Review on public repos. Azure Repos: Renovate (NuGet is supported
out of the box), Trivy pipeline, optional GitHub Advanced Security for Azure DevOps
(`--ghazdo`; the C# variant builds between CodeQL init and analyze).

`dotnet list package --vulnerable --include-transitive` runs in every CI as a
non-blocking signal.

## Adopting in an existing repo

- `devkit init --dotnet` copies files only where absent; it never edits `.csproj`
  files. Run `dotnet format` once and commit the reformat before enabling CI.
- `TreatWarningsAsErrors` + `EnforceCodeStyleInBuild` will surface every existing
  warning as an error. Either fix them, lower specific rules in `.editorconfig`, or
  temporarily set `<TreatWarningsAsErrors>false</TreatWarningsAsErrors>` in the
  props and tighten later.
- If projects already declare `<Version>`, move it to `Directory.Build.props` (or
  the release tools will bump only what they find).
- Multiple solutions in the repo? `dotnet format` needs a single `.sln`/`.slnx` in
  the working directory — pass the path explicitly in the hook and CI.
- Central Package Management (`Directory.Packages.props`) is compatible; Dependabot
  and Renovate both read it.

## Customising

| Want to…                                   | Do this                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| Change the SDK                             | Edit `global.json` (`version`, `rollForward`); the Dockerfile base tags too    |
| Allow warnings in tests                    | In `tests/**/*.csproj`: `<TreatWarningsAsErrors>false</TreatWarningsAsErrors>` |
| Disable one analyzer                       | `.editorconfig`: `dotnet_diagnostic.CA1848.severity = none`                    |
| Skip the pre-commit formatter for a commit | `git commit --no-verify`                                                       |
| Publish NuGet packages                     | Add `dotnet pack` + `dotnet nuget push` to the release pipeline after the bump |
