# Azure DevOps — Azure Repos + Azure Pipelines

devkit detects an Azure Repos remote (`dev.azure.com` / `visualstudio.com`) and
scaffolds Azure Pipelines instead of GitHub Actions, Azure Repos conventions
instead of `.github/`, Renovate instead of Dependabot, and a release pipeline
instead of release-please. Force it with `--azure` (alias `--ado`), or force GitHub
with `--github`. Works for all three languages:

```bash
npx devkit init --azure                     # Node (package.json present)
npx devkit init --azure --python --backend  # FastAPI service
npx devkit init --azure --dotnet --backend  # ASP.NET Core minimal API
npx devkit init --azure --ghazdo --sonar    # + Advanced Security + SonarCloud pipelines
```

---

## Contents

- [GitHub → Azure DevOps mapping](#github--azure-devops-mapping)
- [What gets scaffolded](#what-gets-scaffolded)
- [One-time setup in Azure DevOps](#one-time-setup-in-azure-devops)
- [Pipelines](#pipelines)
- [Cost controls](#cost-controls)
- [Add-ons](#add-ons)
- [Governance — `devkit govern azure`](#governance--devkit-govern-azure)
- [Limitations](#limitations)

---

## GitHub → Azure DevOps mapping

| GitHub (devkit default)                        | Azure DevOps (with `--azure`)                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.github/workflows/ci.yml`                     | `azure-pipelines.yml` (per-language CI)                                                                                                                |
| release-please workflow + config               | `.azuredevops/pipelines/release.yml` — commit-and-tag-version / commitizen / versionize                                                                |
| Dependabot                                     | Renovate: `renovate.json` + `.azuredevops/pipelines/renovate.yml` (weekly)                                                                             |
| CodeQL / Trivy / Dependency Review             | Trivy: `.azuredevops/pipelines/security.yml` (free); CodeQL + dependency scanning via GitHub Advanced Security for Azure DevOps (`--ghazdo`, licensed) |
| `.github/PULL_REQUEST_TEMPLATE.md`             | `.azuredevops/pull_request_template.md` (auto-applied to new PRs; links work items with `AB#123`)                                                      |
| `.github/CODEOWNERS`                           | **Required reviewers** branch policy with path filters — `devkit govern azure apply`                                                                   |
| Issue templates                                | Azure Boards work item templates (configured in the project, not in the repo)                                                                          |
| `.github/SECURITY.md`, `CONTRIBUTING.md`       | `SECURITY.md`, `CONTRIBUTING.md` at the repo root                                                                                                      |
| Branch protection / rulesets (`devkit govern`) | Branch policies (`devkit govern azure`)                                                                                                                |
| SonarCloud scan action                         | SonarCloud extension tasks: `.azuredevops/pipelines/sonarcloud.yml` (`--sonar`)                                                                        |
| Scorecard, Lighthouse, npm publish             | not available (GitHub-only); `--publish` / `--lighthouse` are rejected with `--azure`                                                                  |
| VS Code: GitHub PRs / Actions extensions       | `ms-azure-devops.azure-pipelines`, `ms-vscode.azure-repos` added to `extensions.json`                                                                  |

Everything language-specific (ESLint/Prettier, Ruff/mypy, `dotnet format`, hooks,
editor config, scratch workspace) is identical on both hosts.

## What gets scaffolded

```text
azure-pipelines.yml                         CI — build validation gate (node | python | dotnet variant)
.azuredevops/
  pipelines/release.yml                     Conventional Commits → version bump + CHANGELOG + tag (manual run)
  pipelines/security.yml                    Trivy fs scan (vuln, secret, misconfig) on PR / main / weekly
  pipelines/renovate.yml                    Renovate self-hosted, weekly
  pipelines/advanced-security.yml           [--ghazdo]  CodeQL + dependency scanning (GHAzDO)
  pipelines/sonarcloud.yml                  [--sonar]   SonarCloud (cli mode; dotnet scanner mode for .NET)
  pull_request_template.md                  Conventional-Commit title, checklist per language, AB# link
renovate.json                               config:recommended + semantic commits + minor/patch grouping + azureWorkItemId
.azuredevops/pull_request_template/*.md     hotfix / release / dependencies variants (selectable in the PR UI)
.githooks/prepare-commit-msg                appends AB#<id> from the branch name (+ .husky / pre-commit wiring)
nuget.config | .npmrc | [[tool.uv.index]]   [--artifacts <feed>] Azure Artifacts endpoints + pipeline auth
docs/wiki/**                                [--wiki] code-wiki skeleton (.order, subpages, ADR template, runbooks)
sonar-project.properties                    [--sonar, node/python]
SECURITY.md, CONTRIBUTING.md                repo root (Azure text: work items, squash completion, release pipeline)
```

## One-time setup in Azure DevOps

Pipeline YAML in the repo does nothing until a pipeline definition points at it.

1. **Create the pipelines** — Pipelines → New pipeline → Azure Repos Git → your
   repo → _Existing Azure Pipelines YAML file_ → pick `/azure-pipelines.yml`; repeat
   for each file under `.azuredevops/pipelines/`. Name the CI pipeline `CI` so the
   default `buildValidation` policy config finds it.
2. **Build service permissions** (Project settings → Repositories → _repo_ →
   Security → _"<Project> Build Service (<Org>)"_):
   - release pipeline: **Contribute**, **Create tag**, **Bypass policies when
     pushing** (it pushes the release commit + tag to `main`);
   - Renovate: **Contribute**, **Create branch**, **Contribute to pull requests**,
     **Force push** (rebases its own branches); optionally Work Items _Read & write_
     for the dependency dashboard.
3. **Protect `main`** — run `npx devkit govern azure apply --repo <name>` (below), or
   set the policies by hand under Project settings → Repositories → Policies.
4. **Optional integrations** — SonarCloud: install the _SonarQube Cloud_ marketplace
   extension, add a service connection named `SonarCloud`, turn _Automatic Analysis_
   off in SonarCloud, fill the `YOUR_SONAR_ORG` / project keys. GHAzDO: enable
   _Advanced Security_ on the repository (Project settings → Repositories → repo →
   Settings) — it is billed per active committer.

## Pipelines

### CI (`azure-pipelines.yml`)

Triggers on pushes to `main`/`dev` (`batch: true`) and on PRs to them. One job,
`quality`, with `timeoutInMinutes` and a dependency cache:

| Language | Steps                                                                                                                                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| node     | `UseNode@1` (version from `.nvmrc`) → `npm ci` → `npm audit` (non-blocking) → type-check → lint → lint:md → format:check → build → test                                                                        |
| python   | install uv → `uv sync --locked --all-groups` → `pip-audit` (non-blocking) → `ruff check` → `ruff format --check` → `mypy` → markdownlint → `pytest` → JUnit published                                          |
| dotnet   | `UseDotNet@2` (`global.json`) → restore → `dotnet list package --vulnerable` (non-blocking) → build (Release) → `dotnet format --verify-no-changes` → markdownlint → `dotnet test` → TRX + Cobertura published |

### Release (`.azuredevops/pipelines/release.yml`)

Manual (`trigger: none`). `checkout` with `persistCredentials` and full history,
then the language's Conventional-Commit release tool computes the next SemVer from
the commits since the last tag, writes `CHANGELOG.md`, commits and tags, and the
pipeline pushes `HEAD` + tags back to the source branch:

| Language | Tool                                          | Version bumped in                         | Parameters            |
| -------- | --------------------------------------------- | ----------------------------------------- | --------------------- |
| node     | `commit-and-tag-version@13`                   | `package.json` (+ lock)                   | `releaseAs`, `dryRun` |
| python   | commitizen `cz bump --files-only` + `uv lock` | `pyproject.toml` (+ `uv.lock`)            | `increment`, `dryRun` |
| dotnet   | `dotnet versionize --changelog-all`           | every `<Version>` (Directory.Build.props) | `releaseAs`, `dryRun` |

Use squash completion on PRs so the PR title (a Conventional Commit) becomes the
commit these tools read.

### Security (`security.yml`)

Installs a pinned Trivy, scans the working tree once (`vuln,secret,misconfig`,
`CRITICAL,HIGH`, unfixed ignored), prints a table, publishes SARIF as the
`CodeAnalysisLogs` artifact (the free _SARIF SAST Scans Tab_ extension renders it),
and fails on findings. Runs on PRs, `main` and weekly.

### Renovate (`renovate.yml` + `renovate.json`)

Weekly self-hosted run using `System.AccessToken`
(`RENOVATE_PLATFORM=azure`, `RENOVATE_REPOSITORIES=<project>/<repo>`). The repo
config extends `config:recommended` and `:semanticCommits` (so PR titles pass the
commit-msg hook), groups minor/patch updates into one PR, and enables lockfile
maintenance. Uncomment `GITHUB_COM_TOKEN` to fetch release notes from github.com.

### Advanced Security (`advanced-security.yml`, `--ghazdo`)

`AdvancedSecurity-Codeql-Init@1` → (install/build step per language: `npm ci`,
`uv export` → `requirements.txt`, or `dotnet build` for C#) →
`AdvancedSecurity-Dependency-Scanning@1` → `AdvancedSecurity-Codeql-Analyze@1`.
Results land in Repos → Advanced Security. Secret scanning + push protection are
enabled by the repo switch and need no pipeline.

### SonarCloud (`sonarcloud.yml`, `--sonar`)

`SonarCloudPrepare@3` → (build/test for coverage) → `SonarCloudAnalyze@3` →
`SonarCloudPublish@3`. Node/Python use `scannerMode: cli` with
`sonar-project.properties`; .NET uses `scannerMode: dotnet` around
`dotnet build`/`dotnet test` with OpenCover coverage.

## Cost controls

Microsoft-hosted parallel jobs are metered (the free tier grants one parallel job
with 1,800 minutes/month for private projects). Every scaffolded pipeline therefore:

- sets `timeoutInMinutes` on each job (the platform default is 60 minutes; a hung
  install or test would otherwise burn the hour);
- uses `trigger.batch: true` so rapid pushes coalesce into one run;
- caches dependencies (`Cache@2` for npm / uv / NuGet);
- runs scans on a weekly `schedules` cron rather than every push where a PR run
  already covers the change.

## Add-ons

### Work-item linking that does not get in the way

The default branch policy requires a linked work item, so two helpers ship by default:

- **`.githooks/prepare-commit-msg`** appends `AB#<id>` to every commit, taking the first
  number with two or more digits from the branch name (`feature/1234-add-health` →
  `AB#1234`). Node repos call it from `.husky/prepare-commit-msg`, Python repos through
  a `prepare-commit-msg` pre-commit hook (`uv run pre-commit install` installs all hook
  types listed in the config), .NET repos through `core.hooksPath`. Delete the script to
  opt out.
- **`azureWorkItemId` in `renovate.json`** — set it to an open work item (for example a
  standing "Dependency updates" item) so Renovate's PRs can complete. `0` leaves PRs
  unlinked and the policy blocks them.

### Azure Artifacts feeds (`--artifacts <feed>`)

`--artifacts <feed>` (a feed in the repo's project), `<org>/<feed>` (organization-scoped)
or `<org>/<project>/<feed>` writes the package-manager config and the pipeline auth:

| Language | Written                                                                  | Pipeline auth                                                                                      | Local auth                                                           |
| -------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| node     | `.npmrc`: `registry=…/npm/registry/`, `always-auth=true`                 | `npmAuthenticate@0` before `npm ci`                                                                | `npx vsts-npm-auth -config .npmrc` (Windows) or a PAT in `~/.npmrc`  |
| python   | `[[tool.uv.index]]` named `azure`, `default = true`                      | `UV_INDEX_AZURE_USERNAME` / `UV_INDEX_AZURE_PASSWORD` from `$(System.AccessToken)` on the uv steps | `export UV_INDEX_AZURE_USERNAME=azure UV_INDEX_AZURE_PASSWORD=<PAT>` |
| dotnet   | `nuget.config` with the feed as the only source + package source mapping | `NuGetAuthenticate@1` before restore/build                                                         | Azure Artifacts Credential Provider + `dotnet restore --interactive` |

Renovate receives `RENOVATE_HOST_RULES` for the feed host in the same run. Add
nuget.org / npmjs / PyPI as **upstream sources** on the feed so public packages resolve
through it.

### PR template variants

Besides the default template, `.azuredevops/pull_request_template/` holds `hotfix.md`,
`release.md` and `dependencies.md`; Azure Repos offers them in the template dropdown
when a PR is created.

### README build badge

Azure scaffolds render an Azure Pipelines status badge for a pipeline named `CI`
(org/project taken from the remote, `YOUR_ORG/YOUR_PROJECT` when there is none yet).

### Code wiki (`--wiki`)

`--wiki` writes `docs/wiki` ready to publish as a code wiki:

```text
docs/wiki/
  .order                      Home · Getting-Started · Architecture · Runbooks · Contributing
  Home.md                     [[_TOC_]], quick links, environments, owners
  Getting-Started.md          setup / run / verify commands for the language
  Architecture.md             context diagram (::: mermaid), components, data, cross-cutting concerns
  Architecture/.order, Architecture/Decisions.md, Architecture/Decisions/ADR-0000-template.md
  Runbooks.md, Runbooks/Release.md (mirrors the release pipeline), Runbooks/On-Call.md
  Contributing.md             Azure specifics on top of CONTRIBUTING.md
  .attachments/               images and files referenced by pages
```

Azure wiki conventions baked in: hyphens in filenames render as spaces, a page's
subpages live in a folder with the same name, `.order` fixes the sidebar order,
`[[_TOC_]]` / `[[_TOSP_]]` render the table of contents / subpages, `::: mermaid`
blocks render diagrams, and `#123` links work items. Publish it with
`devkit govern azure wiki publish --repo <name>` (or Overview → Wiki → Publish code as
wiki → `/docs/wiki`).

### Shared pipeline templates

`devkit govern azure scaffold-pipeline-templates ./pipeline-templates --project <P>`
writes a repository of `extends` templates (`pipelines/ci-node.yml`, `ci-python.yml`,
`ci-dotnet.yml`) carrying the same CI job as `azure-pipelines.yml`, plus consumer
examples. Tag it `v1`; consumers reference it via `resources.repositories` and
`extends`, so a CI change rolls out by moving the tag. Make it mandatory with a
**Required template** check on your deployment environments.

## Governance — `devkit govern azure`

The Azure Repos counterpart of `devkit govern`: converge **branch policies** on
repos' default branches, list/create repos, and check credentials. It uses the
built-in `fetch` — no Octokit or extra packages (only `yaml` if your config is
YAML; a `.json` config needs nothing).

```bash
export AZURE_DEVOPS_EXT_PAT=...            # PAT: Code (Read & write), Project and Team (Read),
                                           #      Build (Read), Graph/Identity (Read)
npx devkit govern azure doctor --org-url https://dev.azure.com/contoso --project Platform
npx devkit govern azure repos
npx devkit govern azure apply --repo payments-api --dry-run
npx devkit govern azure apply --all --prune
npx devkit govern azure create payments-api
```

| Command                             | Effect                                                                                                                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `doctor`                            | Authenticates, lists projects, checks the project's policy types and repos                                                                                                                                                          |
| `repos`                             | Lists repositories in the project                                                                                                                                                                                                   |
| `create <name>`                     | Creates the repo, then applies the branch policies (they take effect once `main` exists)                                                                                                                                            |
| `apply`                             | Converges branch + repository policies on `--repo`, `--all`, or `--match "api-*,svc-*"`; `--prune` deletes managed-type policies not in the config; `--codeowners [path]` adds required reviewers translated from a CODEOWNERS file |
| `wiki list` / `wiki publish`        | Lists wikis / publishes `--path` (default `/docs/wiki`) of `--repo` as a code wiki named `--name` (default `<repo>-docs`)                                                                                                           |
| `scaffold-pipeline-templates [dir]` | Writes the shared `extends` templates repo (no token needed; `--project`, `--force`)                                                                                                                                                |

Flags: `--org-url`, `--project`, `--default-branch`, `--config`, `--token`,
`--dry-run`, `--prune`. Environment fallbacks: `AZURE_DEVOPS_ORG_URL`,
`AZURE_DEVOPS_PROJECT`, and inside a pipeline `SYSTEM_COLLECTIONURI`,
`SYSTEM_TEAMPROJECT`, `SYSTEM_ACCESSTOKEN` (a bearer token, detected automatically). The token is only ever sent to
`dev.azure.com` or `*.visualstudio.com` over https; for Azure DevOps Server list the host
in `azure.trustedHosts`, otherwise the command refuses to run.

### Policies applied

Configured under `azure:` in `governance.config.yml` (see the commented block in
[`templates/govern/governance.config.yml`](../templates/govern/governance.config.yml));
defaults live in [`lib/govern/azure/defaults.js`](../lib/govern/azure/defaults.js):

| Policy (Azure display name)    | Default                                                                                    | GitHub equivalent                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Minimum number of reviewers    | 1 approver, stale votes reset on push, last pusher cannot approve, creator vote ignored    | `required_approving_review_count`, dismiss stale, last-push approval |
| Work item linking              | required, blocking                                                                         | —                                                                    |
| Comment requirements           | all comments resolved, blocking                                                            | `required_review_thread_resolution`                                  |
| Require a merge strategy       | squash only                                                                                | `allow_squash_merge` only, linear history                            |
| Build                          | `buildValidation: [{ pipeline: CI }]` when configured — the CI pipeline as a blocking gate | `required_status_checks`                                             |
| Required reviewers             | `requiredReviewers: [{ reviewers, paths, minimumApproverCount, message }]` — path-scoped   | CODEOWNERS + code-owner review                                       |
| Status                         | `statusChecks: [{ genre, name }]` — external checks (e.g. SonarCloud quality gate)         | external status checks                                               |
| Git repository settings        | `repositorySettings.caseEnforcement` (default on) — block case-only path changes           | —                                                                    |
| Reserved names restriction     | `repositorySettings.reservedNames` (default on)                                            | —                                                                    |
| Path Length restriction        | `repositorySettings.maxPathLength: 248`                                                    | —                                                                    |
| File size restriction          | `repositorySettings.maxFileSizeMB: 100`                                                    | —                                                                    |
| Commit author email validation | `repositorySettings.authorEmailPatterns: ["*@contoso.com"]`                                | —                                                                    |
| File name restriction          | `repositorySettings.blockedFilePatterns: ["*.pfx"]`                                        | —                                                                    |

Policy type ids differ per organization, so they are resolved by display name from
`_apis/policy/types`; pipelines are resolved by name and reviewers by email,
display name, `[Project]\Team` group or identity id. Every run is idempotent:
existing configurations on the same repo + branch scope are updated in place,
missing ones created, and `--dry-run` prints the plan without any write.

## Limitations

- No `CODEOWNERS` file: Azure Repos has no file-based equivalent. `devkit govern azure
apply --codeowners` translates one into required-reviewer policies (last-match-wins
  becomes every-match-applies, `**` is not supported, teams are resolved by display
  name), or maintain `requiredReviewers` directly.
- No issue templates: Azure Boards manages work item templates in the project.
- Release pipelines push directly to the protected branch (with _Bypass policies
  when pushing_ for the build service) rather than opening a release PR.
- OSSF Scorecard, Lighthouse CI and the npm publish flow are GitHub-only.
- Pipeline YAML is validated structurally by devkit's tests (schema shape, job
  timeouts) but Azure DevOps only fully validates a pipeline when it is created —
  create them right after `init` to catch environment-specific issues early.
