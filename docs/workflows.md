# GitHub Actions Workflows

`devkit init` scaffolds a set of GitHub Actions workflows into `.github/workflows/`.
Some are installed by default; others are opt-in via CLI flags. This page explains
every workflow, what it does, when it runs, and how to customise it.

---

## Contents

- [Actions usage & cost controls](#actions-usage--cost-controls)
- [CI (`ci.yml`)](#ci)
- [Release Please (`release-please.yml`)](#release-please)
- [Release Please + npm Publish (`release-please-publish.yml`)](#release-please--npm-publish)
- [Publish — manual (`publish.yml`)](#publish--manual)
- [CodeQL (`codeql.yml`)](#codeql)
- [Dependency Review (`dependency-review.yml`)](#dependency-review)
- [Trivy (`trivy.yml`)](#trivy)
- [Scorecard (`scorecard.yml`)](#scorecard)
- [Lighthouse CI (`lighthouse.yml`)](#lighthouse-ci)
- [SonarCloud (`sonarqube.yml`)](#sonarcloud)
- [Dependabot (`dependabot.yml`)](#dependabot)

---

## Actions usage & cost controls

GitHub Actions minutes are **free and unlimited on public repos** but **metered
against a monthly quota on private repos** (Free: 2,000 min/mo, Team: 3,000,
Enterprise: 50,000; the minute allowance resets at the start of each billing
cycle). To keep private repos inside that quota, every scaffolded workflow ships
with two restrictions. Both are harmless on public repos, so they apply regardless
of visibility.

### `timeout-minutes` — runaway protection

Every job sets a `timeout-minutes` cap. Without it a job inherits the **6-hour
(360-minute) default**, so a single hung step — a frozen install, a server that
never becomes ready, a test that deadlocks — can silently burn hundreds of
metered minutes before GitHub kills it. The caps are generous (well above normal
run times) but bounded:

| Workflow | Job | `timeout-minutes` |
| --- | --- | :---: |
| CI (`ci.yml`) | quality | 15 |
| Release Please (`release-please.yml`) | release-please | 10 |
| Release Please + Publish (`release-please-publish.yml`) | release-please | 15 |
| Publish (`publish.yml`) | publish | 15 |
| CodeQL (`codeql.yml`) | analyze | 30 |
| Dependency Review (`dependency-review.yml`) | dependency-review | 10 |
| Trivy (`trivy.yml`) | scan | 20 |
| Scorecard (`scorecard.yml`) | analysis | 15 |
| SonarCloud (`sonarqube.yml`) | sonarcloud | 15 |
| Lighthouse (`lighthouse.yml`) | lighthouse | 20 |

If a job legitimately needs longer (a large monorepo build, a slow E2E suite),
raise its `timeout-minutes`. If a job is consistently fast, lower it to fail
faster and waste fewer minutes when something hangs.

### `concurrency` — cancel superseded runs

Each workflow declares a `concurrency` group so overlapping runs don't stack up
billable minutes:

- **Push/PR scans** (CI, CodeQL, Trivy, Dependency Review, Scorecard, SonarCloud,
  Lighthouse) use `cancel-in-progress: true` keyed on the ref. Pushing again while
  a run is in flight cancels the older run — only the latest commit is checked.
- **Release & publish** (Release Please, Publish) use `cancel-in-progress: false`,
  so an in-progress run is **never cancelled** — cancelling mid-`npm publish` could
  leave a release half-finished. Each serializes runs _within its own workflow_;
  the manual `publish.yml` deliberately uses a separate group so it can still run
  as a recovery path even if a release run is stuck (npm rejects a duplicate
  version with a 409, so an accidental double-publish fails harmlessly).

> **Other levers (not enabled by default).** `paths-ignore`/`paths` can skip CI
> for changes that don't affect it — but devkit's CI lints Markdown, YAML and JSON
> (`lint:md`, `format:check`), so a blanket `paths-ignore: ['**.md']` would skip
> those gates. Add path filters only for paths CI genuinely ignores (images,
> `LICENSE`). A `dev` branch trigger that you don't use can also be dropped from
> the `on:` lists to halve trigger surface.

---

## CI

**File:** `.github/workflows/ci.yml`
**Installed:** always (default)
**Triggers:** push and pull_request on `main` and `dev`

The core quality gate. Runs on every push and PR against `main`/`dev`.

```
checkout → setup-node (reads .nvmrc) → npm ci
  → npm audit
  → type-check  (npm run type-check --if-present)
  → lint        (npm run lint --if-present)
  → lint:md     (npm run lint:md --if-present)
  → format:check(npm run format:check --if-present)
  → build       (npm run build --if-present)
  → test        (npm test --if-present)
```

Key design decisions:

- **`--if-present`** — every step is conditional. If a repo has no build script the
  step is silently skipped rather than failing. This lets the same workflow file work
  for libraries, APIs, and frontends without any changes.
- **`npm audit --audit-level=high`** — runs on all repos (public and private) and is
  `continue-on-error: true` so it never blocks a merge. Use it as a signal, not a gate.
  Private repos without GitHub Advanced Security (GHAS) get this as their free
  dependency-security check.
- **`concurrency`** — a push to a branch while CI is already running cancels the
  older run, keeping queues short and saving Actions minutes (see
  [Actions usage & cost controls](#actions-usage--cost-controls)).
- **`timeout-minutes: 15`** — a hard cap on the job so a hung step can't drain a
  private repo's metered Actions minutes (the default would be 6 hours).
- **`node-version-file: .nvmrc`** — the Node version is a single source of truth in
  `.nvmrc`; CI, local development, and Docker all read from it.

**Customisation:**

| Want to… | Do this |
| --- | --- |
| Add a `dev` branch | Already included in the `branches` list |
| Make `npm audit` block merges | Remove `continue-on-error: true` |
| Add a coverage upload step | Append a step after `test` |
| Change the Node version | Edit `.nvmrc`; CI picks it up automatically |
| Allow longer (or shorter) runs | Adjust `timeout-minutes` on the `quality` job |

---

## Release Please

**File:** `.github/workflows/release-please.yml`
**Installed:** default (without `--publish`); replaced by the publish variant when `--publish` is used
**Triggers:** push to `main`

Automates semantic versioning and changelog management using
[release-please](https://github.com/googleapis/release-please).

**How it works:**

1. Every merge to `main` is inspected for
   [Conventional Commit](https://www.conventionalcommits.org/) prefixes.
2. release-please maintains an open **release PR** that accumulates those commits.
   The PR title shows the next version; the body is the generated `CHANGELOG.md` diff.
3. Merging the release PR bumps `version` in `package.json`, writes `CHANGELOG.md`,
   creates a git tag (`v0.x.y`), and publishes a GitHub Release.

**Commit → version mapping:**

| Commit prefix | Version bump |
| :--- | :--- |
| `feat:` | minor (`0.x.0`) |
| `fix:` | patch (`0.0.x`) |
| `feat!:` / `BREAKING CHANGE:` footer | major (`x.0.0`) |
| `docs:` `chore:` `refactor:` `ci:` `build:` `perf:` `style:` `test:` | no bump |

**Config files installed alongside:**

- `release-please-config.json` — sets `release-type: node`,
  `bump-minor-pre-major: true` (minor bumps stay as `0.x` while < 1.0),
  `bump-patch-for-minor-pre-major: true`.
- `.release-please-manifest.json` — tracks the current version; auto-updated by
  release-please on each release.

**Permissions required:** `contents: write` and `pull-requests: write`.
Both are granted in the workflow and require no extra configuration.

---

## Release Please + npm Publish

**File:** `.github/workflows/release-please-publish.yml`
**Installed:** when `devkit init --publish` is used (replaces `release-please.yml`)
**Triggers:** push to `main`, `workflow_dispatch`

Extends [Release Please](#release-please) with an automated npm publish step that
runs immediately after the release PR is merged.

**Why publish is integrated here (not in a separate `on: release` workflow):**
GitHub Actions does not trigger workflows from events created by `GITHUB_TOKEN`. A
release created by release-please would never fire an `on: release` workflow. The
publish step therefore lives inside this workflow, gated by
`if: ${{ steps.release.outputs.release_created || github.event_name == 'workflow_dispatch' }}`.

**Flow:**

```
push to main
  └── release-please-action
        ├── (no release yet) → update/open release PR, stop
        └── (release PR just merged) → create tag + GitHub Release
              └── checkout → setup-node → npm ci → build → npm publish --provenance

workflow_dispatch (manual re-trigger)
  └── release-please-action (no-op, release already exists)
        └── checkout → setup-node → npm ci → build → npm publish --provenance
```

**Requirements:**

- An npm automation token stored as `NPM_TOKEN` (repo or org secret).
- `id-token: write` permission (already set) for npm provenance signing.
- `publishConfig.access: "public"` in `package.json` (already set by devkit).

**Customisation:**

| Want to… | Do this |
| --- | --- |
| Publish to a private registry | Change `registry-url` in Setup Node |
| Publish without provenance | Remove `--provenance` from the publish command |
| Add a pre-publish build step | The `Build` step (`npm run build --if-present`) already covers this |
| Pin the release-please version | Change `@v5` to a specific SHA |

### Recovering from a failed publish (expired NPM_TOKEN)

When the publish step fails because `NPM_TOKEN` is expired, the GitHub release and
git tag are already created — re-running the workflow via the "Re-run failed jobs"
button skips the publish because `release_created` is now `false`.

Correct recovery procedure:

1. Go to the npm website → **Access Tokens** → **Generate New Token** →
   choose **Automation** (bypasses 2FA for CI).
2. Update the `NPM_TOKEN` secret in GitHub (repo or org → Settings → Secrets →
   Actions).
3. Go to **Actions → Release Please → Run workflow** (the `workflow_dispatch`
   trigger). The release-please step runs as a no-op; the publish step runs
   unconditionally because the event is `workflow_dispatch`.

> **Why not "Re-run failed jobs"?** That button re-runs the same event (`push`).
> On re-run, release-please finds the release already exists and sets
> `release_created: false`, skipping publish. The `workflow_dispatch` trigger
> bypasses this because its condition is checked independently of `release_created`.

---

## Publish — manual

**File:** `.github/workflows/publish.yml`
**Installed:** when `devkit init --publish` is used (alongside the release-please variant)
**Triggers:** `workflow_dispatch` (manual, from GitHub Actions UI)

A standalone recovery workflow. Use it as an alternative to re-triggering the
release-please workflow when auto-publish failed. It publishes whatever version is
currently in `package.json` with no release-please involvement.

**How to trigger:**
GitHub → Actions → **Publish (manual)** → **Run workflow**.

No inputs are required. It publishes whatever version is currently in `package.json`.

> If the version is already published on npm, npm will return a 409 conflict.
> This means the publish already succeeded — no action needed.

---

## CodeQL

**File:** `.github/workflows/codeql.yml`
**Installed:** public repos only (skipped when `--private`)
**Triggers:** push to `main`, pull_request on `main`, weekly schedule (Mondays 06:00 UTC)

GitHub's static analysis engine for security vulnerabilities in JavaScript and
TypeScript source code. Results appear in the repository **Security → Code scanning** tab.

**What it finds:**
SQL injection, XSS, path traversal, prototype pollution, insecure use of `eval`,
hard-coded credentials, and dozens of other CWE-mapped findings using the
`security-extended` query suite (a superset of the default queries).

**Permissions:** `security-events: write` (job-level, to upload SARIF results).

**Customisation:**

```yaml
# Add more query suites:
queries: security-extended,security-and-quality

# Exclude paths:
- name: Initialize CodeQL
  uses: github/codeql-action/init@v4
  with:
    languages: javascript-typescript
    queries: security-extended
    paths-ignore: '["**/test/**", "**/mocks/**"]'
```

---

## Dependency Review

**File:** `.github/workflows/dependency-review.yml`
**Installed:** public repos only (skipped when `--private`)
**Triggers:** pull_request on `main` and `dev`

Flags new dependencies introduced in a PR that have known vulnerabilities (CVEs) in
the GitHub Advisory Database. Runs only on PRs so it never blocks merges to `main`
directly.

**Behaviour:**
- Fails the workflow for any dependency with `high` or `critical` severity.
- Posts a summary comment on the PR when it fails (`comment-summary-in-pr: on-failure`).

**Customisation:**

```yaml
# Block on medium and above:
fail-on-severity: moderate

# Deny specific licences:
deny-licenses: GPL-2.0, AGPL-3.0

# Allow specific advisories (e.g. a known false positive):
allow-ghsas: GHSA-xxxx-xxxx-xxxx
```

---

## Trivy

**File:** `.github/workflows/trivy.yml`
**Installed:** public repos only (skipped when `--private`)
**Triggers:** push to `main`, pull_request on `main`/`dev`, weekly schedule (Mondays 07:00 UTC)

[Trivy](https://trivy.dev) is an all-in-one security scanner. This workflow runs a
**filesystem scan** (no Docker image required) covering:

| Scanner | What it checks |
| --- | --- |
| `vuln` | Known CVEs in `node_modules` (via `package-lock.json`) |
| `secret` | Hard-coded secrets, API keys, tokens committed to source |
| `misconfig` | IaC/config misconfigurations (Dockerfiles, GitHub Actions, etc.) |

Results are uploaded as a SARIF file to GitHub code scanning (Security tab) so
findings appear inline alongside CodeQL results.

**Severity filter:** only `CRITICAL` and `HIGH` findings are reported;
`ignore-unfixed: true` suppresses CVEs with no available fix.

**Why both Trivy and Dependency Review?**
They complement each other. Dependency Review runs only on PRs and uses the GitHub
Advisory Database. Trivy runs on every push, scans secrets and IaC in addition to
deps, and uses its own vulnerability database.

---

## Scorecard

**File:** `.github/workflows/scorecard.yml`
**Installed:** opt-in via `devkit init --scorecard` (public repos only)
**Triggers:** push to `main`, `branch_protection_rule` event, weekly schedule (Mondays 08:00 UTC)

[OSSF Scorecard](https://securityscorecards.dev) evaluates your repo's supply-chain
security posture across 18+ checks including:

| Check | What it measures |
| --- | --- |
| Branch-Protection | Require PR reviews, status checks, dismiss stale reviews |
| Token-Permissions | Workflows use minimal permissions |
| Pinned-Dependencies | Actions pinned to SHAs not floating tags |
| Vulnerabilities | Known CVEs in declared dependencies |
| CI-Tests | Evidence that CI runs tests on PRs |
| Code-Review | PRs reviewed before merge |

Results are uploaded to GitHub code scanning and published to the public
[Scorecard API](https://api.securityscorecards.dev), making your score visible to
the ecosystem (displayed on the OSSF website and in dependency tools).

**Requirements:** the repo must be **public**. On private repos the action requires
a PAT with `repo` + `read:org` scopes stored in `repo_token`.

---

## Lighthouse CI

**File:** `.github/workflows/lighthouse.yml`
**Installed:** opt-in via `devkit init --lighthouse`
**Triggers:** pull_request on `main` and `dev`

Runs [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) on every PR to
measure performance, accessibility, best-practices, and SEO of a running build.

**Flow:**
```
checkout → npm ci → npm run build → start server (via lighthouserc.json)
  → audit URLs → upload results to temporary public storage → post report link
```

**Configuration file:** `lighthouserc.json` (installed alongside the workflow)

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "npm run start",
      "startServerReadyPattern": "ready|started|listening|Local:|localhost",
      "url": ["http://localhost:3000/"],
      "numberOfRuns": 3,
      "settings": { "preset": "desktop" }
    },
    "assert": {
      "assertions": {
        "categories:performance":    ["warn",  { "minScore": 0.9 }],
        "categories:accessibility":  ["error", { "minScore": 0.9 }],
        "categories:best-practices": ["warn",  { "minScore": 0.9 }],
        "categories:seo":            ["warn",  { "minScore": 0.9 }]
      }
    }
  }
}
```

**Key settings to customise:**

| Setting | Default | Common change |
| --- | --- | --- |
| `url` | `localhost:3000/` | Add more routes: `["/", "/about", "/dashboard"]` |
| `numberOfRuns` | `3` | Increase to `5` for more stable averages |
| `preset` | `desktop` | Change to `mobile` or remove for both |
| `accessibility` assertion | `error` (blocks PR) | Change to `warn` during initial adoption |
| `performance` threshold | `0.9` | Lower to `0.75` for complex SPAs |

---

## SonarCloud

**File:** `.github/workflows/sonarqube.yml`
**Installed:** opt-in via `devkit init --sonar`
**Triggers:** push to `main`, pull_request on `main`/`dev`

[SonarCloud](https://sonarcloud.io) provides deep code quality and security analysis
including bug detection, code smells, duplications, security hotspots, and coverage
tracking.

**Setup steps (one-time):**

1. Log in at [sonarcloud.io](https://sonarcloud.io) and import your GitHub repository.
2. Go to **Administration → Analysis Method** and turn **Automatic Analysis OFF**
   (CI and Automatic Analysis cannot both run — CI analysis wins).
3. Generate a token: **My Account → Security → Generate Token**.
4. Add it as a `SONAR_TOKEN` repo or org secret in GitHub.
5. Fill in `sonar-project.properties` (installed alongside the workflow):

```properties
sonar.organization=YOUR_SONAR_ORG
sonar.projectKey=YOUR_ORG_YOUR_REPO

sonar.sources=.
sonar.exclusions=**/node_modules/**,**/dist/**,**/build/**,**/.next/**,**/coverage/**

# Optional: point at LCOV coverage for coverage tracking
# sonar.javascript.lcov.reportPaths=coverage/lcov.info
```

**The `fetch-depth: 0` flag** in the checkout step gives SonarCloud the full git
history, which improves new-code detection and blame annotations. Do not remove it.

---

## Dependabot

**File:** `.github/dependabot.yml`
**Installed:** always (default)
**Triggers:** GitHub-managed schedule (weekly)

Dependabot automatically opens PRs to update outdated or vulnerable dependencies.
The config covers two ecosystems:

```yaml
- package-ecosystem: npm          # node_modules (package.json / package-lock.json)
- package-ecosystem: github-actions  # uses: actions/checkout@v4 etc.
```

**Grouping** — minor and patch npm updates are batched into a single PR per week
(`minor-and-patch` group) to reduce notification noise. Major version bumps always
get their own PR.

**Customisation:**

```yaml
# Review PRs before they can be merged automatically (recommended):
# In repo Settings → Rules → add "Require a pull request before merging"

# Increase the PR limit if you have many outdated deps:
open-pull-requests-limit: 10

# Ignore a specific package:
ignore:
  - dependency-name: "some-legacy-package"
    versions: ["*"]
```
