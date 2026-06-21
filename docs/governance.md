# Governance — `devkit govern`

Create and configure GitHub repositories and organizations to industry standards
in one command: repository settings, branch protection / rulesets, teams,
collaborators, labels, Actions/Dependabot secrets, webhooks, security rollout
(CodeQL, secret scanning, dependency review, Dependabot), org settings, and
Projects v2 automation (auto-triage, auto-add, status automation).

It is built around two complementary halves:

| Half                                    | Tool                            | What it owns                                                                                |
| --------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| **Declarative** (policy-as-code, drift-corrected) | [github/safe-settings](https://github.com/github/safe-settings) App + YAML | repo settings, branch protection, **rulesets**, teams, collaborators, labels, milestones, autolinks, environments, custom properties |
| **Imperative** (one-shot / scripted)    | `devkit govern` (Node + Octokit) | repo **creation**, Actions/Dependabot **secrets**, **webhooks**, **security rollout** (CodeQL / secret scanning / Dependabot / dependency review / org code-security configurations), **org settings**, **Projects v2** automation |

safe-settings deliberately does **not** manage secrets, webhooks, security
enablement, or Projects — so the imperative half fills exactly those gaps. You can
use either half alone, but together they cover the full surface (and roughly match
what the [Terraform GitHub provider](https://registry.terraform.io/providers/integrations/github/latest/docs)
covers, without standing up Terraform state).

> **Why not just Terraform / ghas-cli?** Terraform is excellent if you already run
> IaC with state management. `devkit govern` is a zero-state, run-anywhere CLI for
> teams that don't. For bulk security enablement, the `Malwarebytes/ghas-cli`
> (Python) and `NickLiffen/ghas-enablement` (Node) tools exist; `govern` calls the
> same GitHub **code-security configurations API** directly so you don't need them.

---

## Contents

- [Install](#install)
- [Authentication](#authentication)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Configuration file](#configuration-file)
- [Security & licensing](#security--licensing)
- [Projects v2 automation](#projects-v2-automation)
- [safe-settings (declarative half)](#safe-settings-declarative-half)
- [Industry-standard defaults](#industry-standard-defaults)
- [Coverage matrix](#coverage-matrix)

---

## Install

The govern commands need a few extra packages that are **not** part of the lean
base install. Install them once in the repo/CI where you run governance:

```bash
npm i -D @octokit/rest @octokit/plugin-throttling @octokit/plugin-retry libsodium-wrappers yaml
# add @octokit/auth-app only if you authenticate as a GitHub App
```

Then run via the devkit CLI:

```bash
npx devkit govern --help
```

If a dependency is missing, the CLI tells you exactly what to install.

## Authentication

Token resolution order: `--token` → `GITHUB_TOKEN` / `GH_TOKEN` → GitHub App env
(`APP_ID` + `APP_PRIVATE_KEY` + `APP_INSTALLATION_ID`).

| Operation                       | Classic PAT scope        | Fine-grained / App permission                       |
| ------------------------------- | ------------------------ | --------------------------------------------------- |
| Repo create / settings / branch / rulesets / autolinks | `repo`     | Repository **Administration: write**                |
| Labels                          | `repo`                   | Repository **Issues: write**                        |
| Actions/Dependabot secrets      | `repo` (+`admin:org` for org) | **Secrets: write** / **Dependabot secrets: write** |
| Webhooks                        | `admin:repo_hook` / `admin:org_hook` | **Webhooks: write**                     |
| Security toggles / org config   | `repo` (+`admin:org`)    | Repo/Org **Administration: write**                  |
| Org settings / rulesets         | `admin:org`              | Organization **Administration: write**              |
| **Projects v2**                 | `project` (+`repo`)      | Organization **Projects: read & write**             |

> ⚠️ **The Actions `GITHUB_TOKEN` cannot access org/user Projects v2** — it returns
> "Resource not accessible by integration". Use a PAT or a GitHub App token
> (`actions/create-github-app-token`) for any `projects` command or workflow.

Verify your setup:

```bash
npx devkit govern doctor
```

## Quick start

```bash
# 1. Scaffold a config (edit org + overrides)
npx devkit govern scaffold-safe-settings ./admin --org vpnsin-labs   # declarative half
cp node_modules/@vpnsin-labs/devkit/templates/govern/governance.config.yml .   # imperative half

# 2. Preview everything (no mutations)
npx devkit govern apply --all --dry-run

# 3. Create + fully configure a new repo
npx devkit govern create my-service --template vpnsin-labs/node-template

# 4. Roll out org settings + security configuration to the whole org
npx devkit govern org

# 5. Bulk-enable CodeQL across existing repos
npx devkit govern bulk-codeql
```

## Commands

```text
devkit govern create <name>            create a new repo and configure it end-to-end
devkit govern apply                    apply config to existing repo(s)
devkit govern org                      org settings, rulesets, webhooks, secrets, security rollout
devkit govern labels                   sync labels onto repo(s)
devkit govern rulesets                 apply branch ruleset(s) onto repo(s)
devkit govern security                 enable code/secret scanning + Dependabot on repo(s)
devkit govern webhooks                 sync webhooks onto repo(s)
devkit govern secrets                  set Actions/Dependabot secrets + variables (values from env)
devkit govern projects <add|status>    Projects v2 automation
devkit govern bulk-codeql              bulk-enable CodeQL default setup across the org
devkit govern scaffold-safe-settings   write declarative safe-settings config templates
devkit govern doctor                   verify deps, token, and scopes
```

**Repo selectors** (for `apply`, `labels`, `rulesets`, `security`, `webhooks`,
`secrets`):

| Flag                  | Targets                                        |
| --------------------- | ---------------------------------------------- |
| `--repo <name>`       | one repo                                        |
| `--all`               | every non-archived repo in the org              |
| `--match <glob,glob>` | repos whose name matches any glob (`api-*,svc-*`) |

**Global flags:** `--org`, `--config <path>`, `--dry-run`, `--token`, `--public` /
`--private`, `--template <owner/repo>`, `--prune` (labels), `--with-secrets`,
`--allow-paid` (licence-gated scans on private repos), `--yes`.

> Every mutating command supports `--dry-run`, which prints the planned changes
> (`→ [dry-run] …`) without calling any write APIs.

## Configuration file

`devkit govern` reads `governance.config.{yml,yaml,json,js,mjs}` (or
`.github/governance.config.yml`, or `--config <path>`) and **deep-merges it over
the built-in defaults** — you only declare overrides. See
[`templates/govern/governance.config.yml`](../templates/govern/governance.config.yml)
for the fully-commented template.

Key points:

- **Arrays replace, objects merge.** Setting `labels:` fully replaces the default
  taxonomy; omitting it keeps the default 18-label set.
- **Secret/variable values never live in the file.** Each entry names an env var
  (`from: NPM_TOKEN`) read at apply time. Secrets are encrypted client-side with
  libsodium sealed-box before upload.
- **`protectionMode`** chooses `ruleset` (recommended), `branch-protection`
  (classic), or `both`.

## Security & licensing

`devkit govern security` and `bulk-codeql` enable, per repo:

| Feature                              | Public repos | Private / internal repos                         |
| ------------------------------------ | ------------ | ------------------------------------------------- |
| Dependency graph + Dependabot alerts | free         | **free**                                          |
| Dependabot security updates          | free         | **free**                                          |
| Private vulnerability reporting      | free         | **free**                                          |
| CodeQL (code scanning)               | free         | needs **GitHub Code Security** licence            |
| Secret scanning + push protection    | free         | needs **GitHub Secret Protection** licence        |

The CLI **detects visibility** and skips the licence-gated features on private
repos unless you pass `--allow-paid`. It also never sends `advanced_security` to a
public repo (the API rejects it).

> "GitHub Advanced Security" was split (April 2025) into **GitHub Code Security**
> and **GitHub Secret Protection**, billed per active committer. The org
> code-security **configuration** (`devkit govern org`) bundles every feature and
> attaches it across the fleet via the configurations API — the supported
> replacement for the now-sunset org `security_and_analysis` defaults.

## Projects v2 automation

Three building blocks, all GraphQL (Projects v2 has no REST API):

```bash
# Add an issue/PR to a board (optionally set its Status)
devkit govern projects add --project 5 --repo my-service --number 42 --status "Todo"

# Move a card's Status (e.g. on merge)
devkit govern projects status --project 5 --repo my-service --number 42 --status "Done"
```

For event-driven automation, copy the workflow templates (they handle the
PAT/App-token requirement):

| Template                                       | Trigger                          | Effect                                    |
| ---------------------------------------------- | -------------------------------- | ----------------------------------------- |
| `templates/govern/workflows/add-to-project.yml`| issue/PR opened/labeled          | add to board                              |
| `templates/govern/workflows/project-status.yml`| PR merged                        | set Status = Done (via GitHub App token)  |
| `templates/govern/workflows/auto-triage.yml`   | issue opened                     | label + add to triage board               |
| `templates/govern/labeler.yml`                 | (pair with `actions/labeler@v5`) | path-based PR labels                       |

## safe-settings (declarative half)

```bash
devkit govern scaffold-safe-settings ./admin --org vpnsin-labs
```

writes a ready-to-use admin-repo config:

```text
admin/
├─ .github/
│  ├─ settings.yml                 # org defaults + org-level rulesets
│  ├─ suborgs/example-suborg.yml   # subset of repos (by name/team/property)
│  └─ repos/example-repo.yml       # single repo (filename = repo name)
├─ deployment-settings.yml         # runtime repo-restriction file (App host)
└─ SAFE-SETTINGS.md
```

Commit it to a repo named `admin` on its default branch and install the
safe-settings GitHub App. PRs to the admin repo get **dry-run validation**; merges
apply. See the scaffolded `SAFE-SETTINGS.md` and the
[upstream docs](https://github.com/github/safe-settings) for App hosting.

## Industry-standard defaults

Defaults follow OpenSSF Scorecard + GitHub hardening guidance
([`lib/govern/defaults.js`](../lib/govern/defaults.js)):

- **Merge:** squash-only, delete branch on merge, auto-merge, PR-title commit,
  web commit sign-off; wiki/projects off.
- **Protection (ruleset):** require PR + 1 approving review (bump to 2 for
  OpenSSF 10/10), dismiss stale, code-owner review, thread resolution, strict
  status checks, linear history, no force-push, no deletion.
- **Labels:** an 18-label taxonomy — `type:`, `priority: P0–P3`, `status:`,
  `size:`, `good first issue`, `help wanted`, `dependencies`, `security`.
- **Security:** enable everything free; org config rollout for the fleet.
- **Org:** members default to read, no public-repo creation, Actions token
  read-only and cannot approve PRs.

## Coverage matrix

| Capability               | safe-settings | `devkit govern` | Terraform provider           |
| ------------------------ | :-----------: | :-------------: | ---------------------------- |
| Repository settings      | ✅            | ✅              | `github_repository`          |
| Branch protection        | ✅            | ✅              | `github_branch_protection`   |
| Rulesets (repo + org)    | ✅ (org only) | ✅              | `github_*_ruleset`           |
| Teams / collaborators    | ✅            | ✅              | `github_team*`               |
| Labels                   | ✅            | ✅              | `github_issue_label(s)`      |
| Autolinks / milestones   | ✅            | ✅ (autolinks)  | `github_repository_autolink…`|
| Actions/Dependabot secrets | ❌          | ✅              | `github_actions_secret`      |
| Variables                | ✅ (Actions)  | ✅              | `github_actions_variable`    |
| Webhooks                 | ❌            | ✅              | `github_*_webhook`           |
| CodeQL / secret scanning | ❌            | ✅              | (security_and_analysis)      |
| Dependency review        | ❌ (workflow) | ✅ (ruleset/workflow) | n/a                    |
| Org code-security config  | ❌           | ✅              | n/a                          |
| Org settings             | ❌            | ✅              | `github_organization_settings` |
| Projects v2 automation   | ❌            | ✅              | n/a                          |
| Drift correction         | ✅ (CRON)     | re-run / schedule | `terraform apply`          |
| State required           | no            | no              | yes                          |
