# devkit

[![npm version](https://img.shields.io/npm/v/@vpnsin-labs/devkit.svg)](https://www.npmjs.com/package/@vpnsin-labs/devkit)
[![npm downloads](https://img.shields.io/npm/dm/@vpnsin-labs/devkit.svg)](https://www.npmjs.com/package/@vpnsin-labs/devkit)
[![license: MIT](https://img.shields.io/npm/l/@vpnsin-labs/devkit.svg)](https://www.npmjs.com/package/@vpnsin-labs/devkit)
[![node](https://img.shields.io/node/v/@vpnsin-labs/devkit.svg)](https://www.npmjs.com/package/@vpnsin-labs/devkit)

Shared development tooling for **Node.js/Next.js, Python and .NET** repos hosted on
**GitHub or Azure Repos** — one source of truth for lint + format, Conventional
Commit hooks, editor settings, CI (GitHub Actions or Azure Pipelines), security
scanning, dependency updates (Dependabot or Renovate), release automation and repo
governance. It can also **scaffold a runnable starter** — Express or Next.js,
FastAPI, or an ASP.NET Core minimal API — so a new repo goes from empty to
lint-clean-and-running in one command.

Adopt it in any repo with a single command instead of copy-pasting config.

| Language | Toolchain devkit wires up                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js  | ESLint, Prettier, commitlint, markdownlint, lint-staged, Husky, TypeScript, Jest/Vitest (opt-in)                                                                       |
| Python   | uv, Ruff (lint + format), mypy (strict), pytest, commitizen, pre-commit hooks — all in `pyproject.toml`                                                                |
| .NET     | `global.json` SDK pin, `Directory.Build.props` analyzers + warnings-as-errors, `.editorconfig` code style, `dotnet format` + Conventional Commit git hooks, versionize |

| Host        | CI / security / releases / governance                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub      | GitHub Actions (CI, CodeQL, Trivy, Dependency Review, Scorecard, Sonar, Lighthouse), Dependabot, release-please, `.github/` templates, `devkit govern` |
| Azure Repos | Azure Pipelines (CI, release, Trivy, Renovate, Advanced Security, Sonar), `.azuredevops/` PR template, `devkit govern azure` branch policies           |

## Documentation

- [Workflows guide](docs/workflows.md) — CI, release, security scanning, Lighthouse, SonarCloud, Dependabot (GitHub Actions)
- [Templates guide](docs/templates.md) — every scaffolded file explained with customisation examples
- [Python guide](docs/python.md) — `--python`: uv + Ruff + mypy + pytest + commitizen + pre-commit, FastAPI starter
- [.NET guide](docs/dotnet.md) — `--dotnet`: SDK pin, analyzers, `dotnet format`, git hooks, minimal API starter
- [Azure DevOps guide](docs/azure-devops.md) — `--azure`: Azure Pipelines, Renovate, release pipeline, branch policies
- [Governance guide](docs/governance.md) — `devkit govern`: create & configure GitHub repos/orgs to industry standards (branch protection, rulesets, teams, labels, secrets, security rollout, Projects v2) + safe-settings config

## Contents

- [Quick start](#quick-start)
- [Python and .NET repos](#python-and-net-repos)
- [Azure Repos](#azure-repos)
- [Spin up a new app](#spin-up-a-new-app)
- [Govern repos & orgs](#govern-repos--orgs)
- [CLI options](#cli-options)
- [Public vs private repos](#public-vs-private-repos)
- [Manual usage (without the CLI)](#manual-usage-without-the-cli)
- [What's inside](#whats-inside)
- [What gets scaffolded](#what-gets-scaffolded)
- [Recommended VS Code extensions](#recommended-vs-code-extensions)
- [Not included (and why)](#not-included-and-why)
- [Conventions this enforces](#conventions-this-enforces)
- [Publishing (maintainers)](#publishing-maintainers)

## Quick start

```bash
# in the target repo (must contain a package.json)
npm i -D @vpnsin-labs/devkit
npx devkit init
```

`init` detects the **language** (`package.json` → Node, `pyproject.toml` /
`requirements.txt` → Python, `*.csproj` / `*.sln` / `global.json` → .NET) and the
**host** (an `origin` remote on `dev.azure.com` / `visualstudio.com` → Azure
Repos, otherwise GitHub). Override with `--node|--next|--python|--dotnet` and
`--github|--azure`.

For a Node repo, `init` will:

- detect Next.js vs plain Node and pick the right ESLint + TypeScript preset;
- write thin **config shims** that re-export this package (`eslint.config.ts`,
  `commitlint.config.ts`, `.lintstagedrc.mjs`, `tsconfig.json`, and the
  `prettier` key in `package.json`) so config stays in sync via `npm update`;
- copy the **templates** that can't be referenced — Husky hooks, `.vscode/`,
  `.markdownlint-cli2.jsonc`, the `.github/` **workflows** (CI, CodeQL,
  dependency review, Trivy, release-please) and **governance** (PR template,
  `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, issue templates), plus a
  `README.md` skeleton if one is missing;
- create a **`temp/`** scratch workspace (git-ignored) stocked with format
  starter files for every common file type used in MERN development;
- add npm **scripts** (`lint`, `lint:fix`, `lint:md`, `format`, `format:check`,
  `type-check`, `prepare`);
- install the required dev dependencies and set up Husky.

Existing files are left untouched unless you pass `--force`.

## Python and .NET repos

The scaffolded repo never depends on Node — only the one-time `npx devkit init`
does. Python and .NET have no equivalent of the npm "shim" pattern, so their
config is copied from templates and re-synced with `--force`.

```bash
# Python: existing project, or an empty dir with --backend (FastAPI)
npx devkit init --python
npx devkit init --python --backend

# .NET: existing solution, or an empty dir with --backend (ASP.NET Core minimal API)
npx devkit init --dotnet
npx devkit init --dotnet --backend
```

**Python** (`--python`) writes `pyproject.toml` tables for Ruff, mypy (strict),
pytest, coverage and commitizen plus a PEP 735 `dev` dependency group;
`.python-version`; `.pre-commit-config.yaml` (Ruff fix + format, mypy, `uv lock`,
markdownlint, hygiene hooks, commitizen commit-msg check); a `Makefile` with
`lint / format / type-check / test / check`; Python `.gitignore`, VS Code settings
(Ruff on save) and the CI/release/security files for your host. An existing
`pyproject.toml` is **never overwritten** — devkit appends only the `[tool.*]`
tables that are missing. Then `uv sync --all-groups` and
`uv run pre-commit install --hook-type pre-commit --hook-type commit-msg`.
→ [Python guide](docs/python.md)

**.NET** (`--dotnet`) writes `global.json` (SDK pin, `rollForward: latestFeature`),
`Directory.Build.props` (repo-wide `<Version>`, nullable, implicit usings,
`TreatWarningsAsErrors`, `EnforceCodeStyleInBuild`, `AnalysisLevel
latest-recommended`), a C# `.editorconfig` (formatting, style and naming rules
enforced at build time), `.githooks/` with a `dotnet format` pre-commit and a
Conventional Commit commit-msg hook (plain `sh`, enabled via
`git config core.hooksPath .githooks`), a local tool manifest with `versionize`,
.NET `.gitignore`, VS Code settings (C# Dev Kit) and the CI/release/security files
for your host. → [.NET guide](docs/dotnet.md)

## Azure Repos

With `--azure` (or an Azure Repos `origin` remote) devkit swaps the GitHub layer for
Azure DevOps equivalents while keeping the language tooling identical:

| GitHub                                          | Azure Repos                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`                      | `azure-pipelines.yml` (Node / Python / .NET variant)                                                    |
| release-please                                  | `.azuredevops/pipelines/release.yml` — commit-and-tag-version / commitizen / versionize                 |
| Dependabot                                      | Renovate (`renovate.json` + weekly pipeline)                                                            |
| CodeQL / Trivy / Dependency Review              | Trivy pipeline (free); GitHub Advanced Security for Azure DevOps with `--ghazdo`                        |
| `.github/PULL_REQUEST_TEMPLATE.md`              | `.azuredevops/pull_request_template.md` (`AB#123` work-item links)                                      |
| `CODEOWNERS`, branch rulesets (`devkit govern`) | branch + repository policies (`devkit govern azure apply`, `--codeowners` translates a CODEOWNERS file) |
| GitHub wiki                                     | code wiki published from `docs/wiki` (`--wiki`, `devkit govern azure wiki publish`)                     |
| private npm/PyPI/NuGet registry                 | Azure Artifacts feed wiring with `--artifacts <feed>`                                                   |
| `.github/SECURITY.md`, `CONTRIBUTING.md`        | `SECURITY.md`, `CONTRIBUTING.md` at the repo root                                                       |

Pipelines run once you create them in Azure DevOps (Pipelines → New → Existing
YAML). The release and Renovate pipelines push to the repo, so the build service
needs _Contribute_, _Create tag/branch_ and (release) _Bypass policies when
pushing_. Every Azure scaffold also gets a `prepare-commit-msg` hook that appends
`AB#<id>` from the branch name, three selectable PR templates (hotfix, release,
dependencies), a CI build badge in the README and `azureWorkItemId` in
`renovate.json` so dependency PRs satisfy the work-item policy.
→ [Azure DevOps guide](docs/azure-devops.md)

## Spin up a new app

Bootstrap a fresh repo with a working app **plus** all the tooling above:

```bash
mkdir my-api && cd my-api && npm init -y
npx devkit init --backend     # Express + TypeScript API
```

```bash
mkdir my-web && cd my-web && npm init -y
npx devkit init --frontend    # Next.js (App Router) + TypeScript
```

```bash
mkdir my-service && cd my-service
npx devkit init --python --backend   # FastAPI (uv, src layout, /health, Dockerfile)
npx devkit init --dotnet --backend   # ASP.NET Core minimal API (.slnx, xUnit tests, Dockerfile)
```

Then:

```bash
cp .env.example .env   # backend/frontend ship an example env file
npm run dev            # tsx watch (backend) / next dev (frontend)
uv run uvicorn app.main:app --reload   # FastAPI → :8000/health
dotnet run --project src/Api           # .NET   → :5000/health
```

**`--backend`** scaffolds an Express + TypeScript skeleton and selects the Node
preset:

- `src/server.ts` (entry + graceful shutdown), `src/app.ts` (app factory with
  `helmet` + `cors` + JSON body parsing), `src/routes/health.ts`, `src/env.ts`;
- a multi-stage `Dockerfile` (non-root, `--omit=dev` runtime) and `.dockerignore`;
- `.env.example`, and `dev` / `build` / `start` scripts;
- runtime deps `express`, `cors`, `helmet`, `dotenv`.

With `--python`, `--backend` scaffolds FastAPI (`src/app/main.py` factory,
`settings.py` via pydantic-settings, `health.py`, `tests/test_health.py`, uv
multi-stage `Dockerfile`); with `--dotnet`, an ASP.NET Core minimal API
(`<Name>.slnx`, `src/Api`, `tests/Api.Tests` with `WebApplicationFactory`,
sdk→aspnet `Dockerfile`). All three starters expose the same
`GET /health → { status, version, uptime }`.

**`--frontend`** scaffolds a Next.js App Router skeleton and selects the Next
preset:

- `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `next.config.mjs`;
- `.env.example`, and `dev` / `build` / `start` scripts;
- runtime deps `next`, `react`, `react-dom`.

The app starters are flat (single-app) layouts; run them in separate
directories for a backend **and** a frontend, or wire up a monorepo yourself
(`--fullstack` scaffolds a Next.js + Express + MongoDB npm-workspaces monorepo).

## Govern repos & orgs

`devkit govern` creates and configures GitHub repos/orgs to industry standards —
the governance layer on top of the per-repo scaffolding above. It pairs a
**declarative** half ([github/safe-settings](https://github.com/github/safe-settings)
YAML for repo settings, branch protection, rulesets, teams, collaborators, labels)
with an **imperative** Node + Octokit half for everything safe-settings can't do:
repo creation, Actions/Dependabot secrets, webhooks, security rollout
(CodeQL, secret scanning, Dependabot, dependency review, org code-security
configurations), org settings, and Projects v2 automation (auto-triage,
auto-add, status automation).

```bash
# one-time: install the extra deps (kept out of the lean base install)
npm i -D @octokit/rest @octokit/plugin-throttling @octokit/plugin-retry libsodium-wrappers yaml

export GITHUB_TOKEN=ghp_...            # repo admin (+ admin:org for org ops)
npx devkit govern doctor               # verify token + scopes

npx devkit govern apply --all --dry-run                  # preview org-wide
npx devkit govern create my-service --template org/tmpl  # create + configure
npx devkit govern org                                     # org settings + security rollout
npx devkit govern scaffold-safe-settings ./admin --org vpnsin-labs  # declarative config
```

Defaults follow OpenSSF Scorecard / GitHub hardening guidance (squash-only merges,
ruleset-based branch protection, an 18-label taxonomy, security-on-by-default with
private-repo licence gating). Every mutating command supports `--dry-run`. Full
reference: **[Governance guide](docs/governance.md)**.

**Azure Repos** — `devkit govern azure` converges branch policies on a repo's
default branch (1 approving review with stale-vote reset, comment resolution,
work-item linking, squash-only merges, build validation, path-scoped required
reviewers, status checks), lists/creates repos and checks credentials. It uses the
built-in `fetch` with a PAT (`AZURE_DEVOPS_EXT_PAT`) — no Octokit needed.

```bash
export AZURE_DEVOPS_EXT_PAT=...
npx devkit govern azure doctor --org-url https://dev.azure.com/contoso --project Platform
npx devkit govern azure apply --repo payments-api --dry-run
npx devkit govern azure apply --all --prune
npx devkit govern azure apply --repo payments-api --codeowners .github/CODEOWNERS
npx devkit govern azure wiki publish --repo payments-api
npx devkit govern azure scaffold-pipeline-templates ./pipeline-templates --project Platform
```

## CLI options

```bash
# language (auto-detected from package.json / pyproject.toml / *.csproj; flags override)
npx devkit init --node        # Node.js, base ESLint preset
npx devkit init --next        # Node.js, Next.js ESLint preset
npx devkit init --python      # Python: uv + Ruff + mypy + pytest + commitizen + pre-commit
npx devkit init --dotnet      # .NET: global.json + Directory.Build.props + .editorconfig + hooks + versionize

# host (auto-detected from the git origin remote; flags override)
npx devkit init --github      # GitHub Actions + Dependabot + release-please + .github/ (default)
npx devkit init --azure       # Azure Pipelines + Renovate + release pipeline + .azuredevops/ (alias --ado)

# app starters
npx devkit init --backend     # Express+TS (node) · FastAPI (python) · ASP.NET Core minimal API (dotnet)
npx devkit init --frontend    # Next.js (App Router) frontend                       [node]
npx devkit init --fullstack   # Next.js + Express + MongoDB monorepo (alias --mern)  [node]

# options
npx devkit init --private     # private repo: skip GHAS workflows (auto-detected via gh)  [github]
npx devkit init --public      # public repo: include GHAS workflows                      [github]
npx devkit init --jest        # scaffold Jest (ts-jest)                                  [node]
npx devkit init --vitest      # scaffold Vitest (alternative to Jest)                    [node]
npx devkit init --scorecard   # also add the OSSF Scorecard workflow (public GitHub repos)
npx devkit init --lighthouse  # also add a Lighthouse CI workflow (web apps)             [node · github]
npx devkit init --skills      # also add Claude Code skills (design-craft for UI/UX)
npx devkit init --publish     # auto-publish to npm when the release PR merges (NPM_TOKEN) [node · github]
npx devkit init --sonar       # also add SonarCloud analysis (SONAR_TOKEN / service connection)
npx devkit init --ghazdo      # also add the GitHub Advanced Security for Azure DevOps pipeline [azure]
npx devkit init --artifacts <feed>  # Azure Artifacts feed: nuget.config / .npmrc / uv index + pipeline auth [azure]
npx devkit init --wiki        # also scaffold docs/wiki as an Azure code wiki (.order, ADRs, runbooks) [azure]
npx devkit init --force       # overwrite existing config/template files (pyproject.toml is only appended to)
npx devkit init --no-install  # scaffold only, install deps/tools yourself
```

## Public vs private repos

GitHub Advanced Security — **CodeQL, Trivy, Dependency Review, Scorecard** — is
free on **public** repos but needs a paid licence on **private** ones. `init`
auto-detects visibility with the `gh` CLI (override with `--private` / `--public`):

- **Public** → the full GHAS workflow set is scaffolded.
- **Private** → those GHAS workflows are skipped; you still get **Dependabot**
  (alerts + grouped update PRs) and a non-blocking dependency audit step in CI
  (`npm audit` / `pip-audit` / `dotnet list package --vulnerable`) for free
  dependency security. (Enable _Dependabot alerts_ in repo settings.)

GitHub Actions minutes are also metered on private repos (public repos run free),
so every scaffolded workflow ships with two cost-control restrictions to keep
runs inside the monthly quota:

- **`timeout-minutes`** on every job — a hard cap (the default is 6 hours, so a
  single hung job can otherwise drain hundreds of metered minutes).
- **`concurrency`** — push/PR scans auto-cancel superseded runs
  (`cancel-in-progress: true`); release/publish runs serialize but are never
  cancelled mid-flight (`cancel-in-progress: false`).

These caps are harmless on public repos and apply regardless of visibility. Azure
Repos are always private to the organization; the Azure Pipelines carry the same
idea (`timeoutInMinutes`, `trigger.batch`, dependency caches) because
Microsoft-hosted parallel-job minutes are metered too.

`--sonar` adds a CI-based SonarCloud scan and a `sonar-project.properties`.
Set a `SONAR_TOKEN` secret, fill in your org/project keys, and turn **off**
Automatic Analysis in SonarCloud (CI and Automatic Analysis can't both run).
SonarCloud is also free only for public projects. For .NET the workflow wraps the
build with `dotnet-sonarscanner` (C# needs it); on Azure the SonarCloud extension
tasks are used.

With `--publish`, merging the release-please PR auto-publishes to npm: the publish
step is integrated into the release-please workflow (a release created with
`GITHUB_TOKEN` can't trigger a separate `on: release` workflow, so it must live
there). You also get a manual `Publish (manual)` workflow (`workflow_dispatch`) to
re-publish if an auto-publish fails. Add an `NPM_TOKEN` repository secret (an npm
automation token) for it to authenticate.

After running, fill the placeholders in `.github/CODEOWNERS` (`@OWNER`) and the
security contact in `.github/SECURITY.md` (on Azure: `SECURITY.md` at the root).

## Manual usage (without the CLI)

Each Node config is also importable directly:

```ts
// eslint.config.ts  (needs the `jiti` devDependency to load TS config)
export { default } from '@vpnsin-labs/devkit/eslint/next'; // or '@vpnsin-labs/devkit/eslint/base'

// extend it:
import base from '@vpnsin-labs/devkit/eslint/base';
export default [...base, { rules: { 'no-console': 'off' } }];
```

```jsonc
// package.json
{ "prettier": "@vpnsin-labs/devkit/prettier" }
```

```ts
// commitlint.config.ts
export { default } from '@vpnsin-labs/devkit/commitlint';

// vitest.config.ts (alternative to Jest)
import { defineConfig } from 'vitest/config';
import base from '@vpnsin-labs/devkit/vitest';
export default defineConfig(base);
```

```js
// .lintstagedrc.mjs  (stays .mjs — .ts breaks the bare `npx lint-staged` hook)
export { default } from '@vpnsin-labs/devkit/lint-staged';

// jest.config.mjs (Node + ts-jest; stays .mjs — ts-node can't re-export the ESM preset)
export { default } from '@vpnsin-labs/devkit/jest';
```

```jsonc
// tsconfig.json — extend a shared base (base / node / next)
{
  "extends": "@vpnsin-labs/devkit/tsconfig/node.json",
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"],
}
```

Python and .NET templates can be copied by hand from
`node_modules/@vpnsin-labs/devkit/templates/{python,dotnet,azuredevops}/`.

## What's inside

- **ESLint** — `@vpnsin-labs/devkit/eslint/base` (Node) / `@vpnsin-labs/devkit/eslint/next`
  (base + `eslint-config-next`). Flat config: JS + typescript-eslint + Prettier.
- **Prettier** — `@vpnsin-labs/devkit/prettier` (100 width, single quotes, es5 commas).
- **commitlint** — `@vpnsin-labs/devkit/commitlint` (Conventional Commits).
- **lint-staged** — `@vpnsin-labs/devkit/lint-staged` (ESLint/Prettier/markdownlint on staged files).
- **TypeScript** — `@vpnsin-labs/devkit/tsconfig/{base,node,next}.json` (strict base + Node/Next variants).
- **Jest / Vitest** — `@vpnsin-labs/devkit/jest` (ts-jest) or `@vpnsin-labs/devkit/vitest`; opt-in via `--jest` / `--vitest`.
- **Python toolchain** — `pyproject.toml` tables for Ruff (100 cols, `E F W I UP B SIM N C4 PT RUF`), mypy strict, pytest, coverage, commitizen; `.pre-commit-config.yaml`; `Makefile`; `.python-version`.
- **.NET toolchain** — `global.json`, `Directory.Build.props`, C# `.editorconfig`, `.githooks/` (`dotnet format` + Conventional Commits), `.config/dotnet-tools.json` (versionize).
- **App starters** — `--backend` (Express + TS / FastAPI / ASP.NET Core minimal API), `--frontend` (Next.js App Router + TS), `--fullstack` (MERN monorepo).
- **GitHub workflows** — CI (per language), CodeQL (per language), dependency review, Trivy, release-please; opt-in: Scorecard, Lighthouse, npm-publish, SonarCloud.
- **Azure Pipelines** — CI (per language), release (commit-and-tag-version / commitizen / versionize), Trivy security, Renovate; opt-in: Advanced Security (GHAzDO), SonarCloud.
- **Governance** — `SECURITY.md`, `CONTRIBUTING.md` (per language), `CODEOWNERS`, PR & issue templates (GitHub); `.azuredevops/pull_request_template.md` (Azure).
- **Repo/org governance** — `devkit govern` (GitHub, Octokit + safe-settings) and `devkit govern azure` (Azure Repos branch policies, built-in fetch).
- **EditorConfig** — `templates/editorconfig` (LF, UTF-8, 2-space; 4-space for `*.py` / `*.cs`).
- **npm config** — `.npmrc` (`engine-strict`, quieter installs; optional exact pins).
- **Spell check** — `cspell.json` for the recommended Code Spell Checker extension.
- **Node version** — `.nvmrc`; CI reads it via `node-version-file`.
- **Scratch workspace** — `temp/` (git-ignored) with format starter files for JS, TS (Node), Python, C# (.NET 10 file-based app), JSON, env, log, shell, PowerShell, plain text, Markdown, and HTTP requests.
- **Claude Code skills** — `design-craft` (a UX/visual-design protocol); opt-in via `--skills`.

## What gets scaffolded

| Area                                         | Source template                                                             | Purpose                                                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| ESLint / Prettier / commitlint / lint-staged | shims re-exporting the package                                              | flat ESLint, Prettier, Conventional Commits, staged-file lint                                                            |
| TypeScript                                   | `tsconfig.json` extending `@vpnsin-labs/devkit/tsconfig/*`                  | strict base + Node/Next variant                                                                                          |
| Python tooling                               | `templates/python/*`                                                        | `pyproject.toml` tables, pre-commit, Makefile, `.python-version`, gitignore, VS Code (`--python`)                        |
| .NET tooling                                 | `templates/dotnet/*`                                                        | `global.json`, `Directory.Build.props`, C# `.editorconfig`, `.githooks/`, tool manifest, gitignore, VS Code (`--dotnet`) |
| Backend app                                  | `templates/app/backend/*`, `templates/{python,dotnet}/app/backend/*`        | Express + TS / FastAPI / ASP.NET Core skeleton + Dockerfile (opt-in, `--backend`)                                        |
| Frontend app                                 | `templates/app/frontend/*`                                                  | Next.js App Router + TS skeleton (opt-in, `--frontend`)                                                                  |
| markdownlint                                 | `templates/markdownlint-cli2.jsonc`                                         | tuned to coexist with Prettier                                                                                           |
| Spell check                                  | `templates/cspell.json`                                                     | project words + ignores for the Code Spell Checker extension                                                             |
| npm config                                   | `templates/npmrc`                                                           | `engine-strict`, quieter installs, optional exact pins                                                                   |
| Husky hooks                                  | `templates/husky/*`                                                         | pre-commit → lint-staged, commit-msg → commitlint (Node)                                                                 |
| CI                                           | `templates/github/workflows/ci{,.python,.dotnet}.yml`                       | per-language quality gate (GitHub Actions)                                                                               |
| GHAS                                         | `codeql{,.python,.dotnet}.yml`, `dependency-review.yml`, `trivy.yml`        | code scanning + vulnerable-dependency gate (public repos)                                                                |
| Scorecard                                    | `templates/github/workflows/scorecard.yml`                                  | OSSF supply-chain posture (opt-in, `--scorecard`)                                                                        |
| Releases                                     | `release-please.yml` + `release-please-config{,.python,.dotnet}.json`       | semantic version bumps, tags & changelog                                                                                 |
| Azure Pipelines                              | `templates/azuredevops/*`                                                   | `azure-pipelines.yml` per language, release/security/Renovate, opt-in GHAzDO + SonarCloud (`--azure`)                    |
| Governance                                   | `SECURITY.md`, `CONTRIBUTING{,.python,.dotnet}.md`, `CODEOWNERS`, templates | project docs & review routing (GitHub); `.azuredevops/pull_request_template.md` + root docs (Azure)                      |
| Editor                                       | `templates/vscode/*`, `templates/{python,dotnet}/vscode/*`                  | format + fix on save per language; host extensions appended                                                              |
| Scratch workspace                            | `templates/temp/*`                                                          | gitignored `temp/` with language-appropriate format starter files                                                        |

## Recommended VS Code extensions

`init` writes a `.vscode/extensions.json` so VS Code prompts the team to install a
shared set of extensions. They're _recommendations_, not requirements — nothing
breaks if you skip one. The Node set is below; Python repos get the Python set
(Python, Pylance, debugpy, **Ruff**, mypy, Even Better TOML) and .NET repos the
.NET set (**C# Dev Kit**, C#, .NET runtime, XML), each with the shared docs/Git/
quality extensions. Azure Repos adds `ms-azure-devops.azure-pipelines` and
`ms-vscode.azure-repos`; GitHub adds the GitHub PRs and Actions extensions.

**Formatting, linting & spell-check** — the toolchain devkit wires up:

- `esbenp.prettier-vscode` — format on save with Prettier.
- `dbaeumer.vscode-eslint` — inline ESLint + fix-on-save.
- `DavidAnson.vscode-markdownlint` — lint/fix Markdown (matches `lint:md`).
- `streetsidesoftware.code-spell-checker` — spell-check code & docs (reads `cspell.json`).
- `EditorConfig.EditorConfig` — apply `.editorconfig` (LF, 2-space, final newline).

**Diagnostics & DX**:

- `usernamehw.errorlens` — show errors/warnings inline on the line.
- `yoavbls.pretty-ts-errors` — make TypeScript errors readable.
- `wix.vscode-import-cost` — show the bundle size of each import.

**JavaScript / TypeScript / React authoring**:

- `dsznajder.es7-react-js-snippets` — React/Hooks snippets.
- `formulahendry.auto-rename-tag` — rename paired JSX/HTML tags together.
- `christian-kohler.npm-intellisense` — autocomplete `import` paths for npm packages.
- `christian-kohler.path-intellisense` — autocomplete local file paths.
- `wmaurer.change-case` — convert identifiers between camel/snake/kebab/etc.

**Testing** (pairs with `devkit init --jest`):

- `orta.vscode-jest` — run the Jest suite with inline pass/fail decorations.
- `firsttris.vscode-jest-runner` — run/debug a single test or `describe` block.
- `andys8.jest-snippets` — snippets for `describe`/`it`/`expect`.

**Git & GitHub** (devkit ships PR templates, governance & GH workflows):

- `eamodio.gitlens` — blame, history & authorship inline.
- `donjayamanne.githistory` — browse file/line history and diffs.
- `ziyasal.vscode-open-in-github` — jump from a line to its page on GitHub.
- `github.vscode-pull-request-github` — review & manage PRs/issues in-editor.

**Code quality** (pairs with `--sonar`):

- `sonarsource.sonarlint-vscode` — SonarLint findings as you type (mirrors SonarCloud).

**File-type support shipped by this scaffold**:

- `mikestead.dotenv` — syntax highlighting for `.env` / `.env.example`.
- `humao.rest-client` — send HTTP requests from `.http` files (pairs with `temp/format.http`).
- `redhat.vscode-yaml` — schema-aware YAML (workflows, Dependabot, etc.).
- `github.vscode-github-actions` — validate & run GitHub Actions workflows.

**Markdown & docs**:

- `yzhang.markdown-all-in-one` — TOC, list editing, shortcuts, preview.
- `bierner.markdown-mermaid` — render Mermaid diagrams in Markdown preview.
- `tom-latham.markdown-pdf-plus` — export Markdown to PDF/HTML.

**Productivity & navigation**:

- `gruntfuggly.todo-tree` — collect `TODO`/`FIXME` markers into a tree.
- `hediet.vscode-drawio` — edit `.drawio` diagrams inside VS Code.
- `l13rary.l13-diff` — compare two folders side by side.
- `bokuweb.vscode-ripgrep` — fast ripgrep-powered search.
- `ritwickdey.liveserver` — serve static files with live reload.

> **Intentionally not recommended.** Color/icon **themes** (keep those in your
> personal user settings — recommending them nags the whole team) and generic
> **cloud/IaC tooling** (Azure CLI, Azure Resource Groups, Terraform). The Azure
> Pipelines and Azure Repos extensions are added only when the repo is hosted on
> Azure Repos — everything else is per-project.

## Not included (and why)

- **Babel / Webpack** — frameworks own this layer. Next.js uses SWC + webpack/
  Turbopack (configure via `next.config.js`); Vite/Vitest use esbuild + Rollup;
  plain TS libraries build with `tsc`/tsup. A shared Babel or Webpack config
  would conflict or go unused. (A `tsup`/Rollup preset can be added if a
  non-framework browser library ever needs bundling.)
- **Poetry / Pipenv / conda** — devkit standardises on `uv` for Python
  environments and lockfiles; Ruff, mypy, pytest and commitizen still work if you
  keep another installer (swap the `uv sync` steps).
- **Central Package Management for .NET** (`Directory.Packages.props`) — optional
  and compatible; devkit doesn't impose it on existing solutions.

## Conventions this enforces

- **Conventional Commits** (`feat:`, `fix:`, `chore:` …) — required by the
  `commit-msg` hook (commitlint / commitizen / a plain `sh` regex hook for .NET)
  and read by the release tooling to bump the version.
- **Formatting is owned by the formatter** — Prettier (Node), Ruff (Python),
  `dotnet format` (.NET); lint surfaces deviations, CI verifies them.
- **CI** runs the language's type-check, lint, format check, build and tests; on
  Node each step is `--if-present`, so it adapts to repos without a build step.

## Publishing (maintainers)

```bash
npm version <patch|minor|major>
npm publish        # publishConfig.access is "public"
```

Consumers pick up changes with `npm update @vpnsin-labs/devkit` (shims) — template files
are re-synced by re-running `npx devkit init --force`.

```bash
npm test           # node:test suite: scaffold matrix, template validity, Azure governance planner
```
