# safe-settings configuration

This directory is a ready-to-use [github/safe-settings](https://github.com/github/safe-settings)
admin-repo config, scaffolded by `devkit govern scaffold-safe-settings`.

safe-settings is a **GitHub App** that enforces repository, branch, team,
collaborator, label, and ruleset settings **declaratively** across your whole
org from one central repo — with dry-run validation on PRs and optional scheduled
drift correction.

## Layout

| File                                | Scope                                          |
| ----------------------------------- | ---------------------------------------------- |
| `.github/settings.yml`              | org-wide defaults **+** org-level rulesets      |
| `.github/suborgs/example-suborg.yml`| a subset of repos (by name/team/property)      |
| `.github/repos/example-repo.yml`    | a single repo (filename = repo name)           |
| `deployment-settings.yml`           | runtime repo-restriction file (App host, **not** the admin repo) |

Precedence: **repo > suborg > org**.

## Setup

1. Create a repo named **`admin`** in your org (or set `ADMIN_REPO`).
2. Commit `.github/settings.yml` (and any `suborgs/` `repos/` files) to its
   **default branch** — safe-settings only reads the default branch.
3. Install the safe-settings GitHub App (self-hosted: Lambda / Docker / Actions —
   see the upstream docs) with the permissions it requests.
4. Keep `deployment-settings.yml` where the **App runs**, not in the admin repo.

## What safe-settings does NOT cover

Actions/Dependabot **secrets**, **webhooks**, **CodeQL / secret-scanning**
enablement, and **Projects v2** automation are not managed by safe-settings. Use
the imperative companion for those:

```bash
devkit govern org          # org settings, rulesets, secrets, security rollout
devkit govern apply --all  # per-repo settings, security, webhooks
```

See `docs/governance.md` in devkit for the full split and workflow.
