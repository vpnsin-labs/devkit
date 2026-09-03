# Python repos — `devkit init --python`

devkit brings the same conventions to Python that it brings to Node: one lint +
format tool, strict types, tests, Conventional Commits enforced by a git hook, a
CI gate, and automated releases. Nothing in the scaffolded repo depends on Node —
the Python toolchain is native (`uv`, Ruff, mypy, pytest, commitizen, pre-commit);
only the one-time `npx devkit init` needs Node.

```bash
# existing project (pyproject.toml / requirements.txt / setup.py detected)
npx devkit init            # or: npx devkit init --python

# brand-new FastAPI service in an empty directory
mkdir my-api && cd my-api
npx devkit init --python --backend
```

Add `--azure` for Azure Repos (see [Azure DevOps guide](azure-devops.md)),
`--private` for a private GitHub repo, `--sonar`, `--skills`, `--force`,
`--no-install` as with Node. Node-only flags (`--frontend`, `--fullstack`,
`--jest`, `--vitest`, `--publish`, `--lighthouse`) are rejected.

---

## Contents

- [What gets scaffolded](#what-gets-scaffolded)
- [Toolchain](#toolchain)
- [Daily commands](#daily-commands)
- [FastAPI starter (`--backend`)](#fastapi-starter---backend)
- [CI](#ci)
- [Releases](#releases)
- [Dependency updates](#dependency-updates)
- [Adopting in an existing repo](#adopting-in-an-existing-repo)
- [Customising](#customising)

---

## What gets scaffolded

| File                                       | Purpose                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pyproject.toml`                           | Project metadata + all tool config (`[tool.ruff]`, `[tool.mypy]`, `[tool.pytest.ini_options]`, `[tool.coverage.*]`, `[tool.commitizen]`, `[dependency-groups]`)                                                                                                                          |
| `.python-version`                          | Interpreter pin read by `uv`, `pyenv`, `setup-uv` in CI                                                                                                                                                                                                                                  |
| `.pre-commit-config.yaml`                  | Git hooks: Ruff fix + format, mypy, `uv lock`, markdownlint, hygiene checks, commitizen commit-msg (plus the Azure `AB#` prepare-commit-msg hook on Azure Repos)                                                                                                                         |
| `Makefile`                                 | `make lint / format / type-check / test / check / install` (mirrors CI)                                                                                                                                                                                                                  |
| `.gitignore`                               | Python, venv, tool caches, `.env`, `temp/`                                                                                                                                                                                                                                               |
| `.editorconfig`                            | LF, UTF-8, 2-space default, **4-space for `*.py`**                                                                                                                                                                                                                                       |
| `.vscode/settings.json`, `extensions.json` | Ruff as formatter + fix-on-save, Pylance, mypy, pytest discovery; recommended extensions                                                                                                                                                                                                 |
| `.markdownlint-cli2.jsonc`, `cspell.json`  | Docs lint + spell check                                                                                                                                                                                                                                                                  |
| `temp/format.py` (+ common scratch files)  | Git-ignored scratch workspace                                                                                                                                                                                                                                                            |
| CI + governance                            | GitHub: `.github/workflows/ci.yml` (Python variant), CodeQL `python`, Dependabot `uv`, release-please `python`, PR/issue templates, `CONTRIBUTING.md` (Python text). Azure: `azure-pipelines.yml` (Python), release/security/Renovate pipelines, `.azuredevops/pull_request_template.md` |

Python and .NET have no equivalent of the npm "shim re-exporting the package"
pattern, so every file above is a **copied template**. Re-sync after a devkit
upgrade with `npx devkit init --python --force` — `pyproject.toml` is the one file
`--force` never overwrites (see [Adopting](#adopting-in-an-existing-repo)).

## Toolchain

| Concern             | Tool                                                                                                            | Node equivalent                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Environments + lock | [uv](https://docs.astral.sh/uv/) — `uv sync` creates `.venv` and `uv.lock`                                      | npm + `package-lock.json`        |
| Lint + format       | [Ruff](https://docs.astral.sh/ruff/) — `line-length = 100`, rules `E F W I UP B SIM N C4 PT RUF`, double quotes | ESLint + Prettier                |
| Types               | [mypy](https://mypy.readthedocs.io/) `strict = true`                                                            | `tsc --noEmit` (strict tsconfig) |
| Tests               | pytest + pytest-cov (`testpaths = ["tests"]`, `--strict-markers`)                                               | Jest / Vitest                    |
| Commit messages     | [commitizen](https://commitizen-tools.github.io/commitizen/) `cz check` in the commit-msg hook                  | commitlint                       |
| Hooks               | [pre-commit](https://pre-commit.com) framework                                                                  | Husky + lint-staged              |
| Release             | release-please (`release-type: python`) on GitHub; `cz bump` pipeline on Azure                                  | release-please                   |

Dev tooling lives in a PEP 735 dependency group (`[dependency-groups] dev`) so it
is installed with `uv sync --all-groups` and excluded from the runtime image with
`uv sync --no-dev`.

## Daily commands

```bash
uv sync --all-groups                                                   # first time / after pulling
uv run pre-commit install # once per clone

make lint          # uv run ruff check . && uv run ruff format --check .
make format        # uv run ruff check . --fix && uv run ruff format .
make type-check    # uv run mypy .
make test          # uv run pytest
make check         # all of the above — what CI runs
```

No `make` on Windows? Run the `uv run …` commands directly (they are listed in the
Makefile), or use `make` from Git Bash / WSL.

`git commit` runs the pre-commit hooks on staged files (Ruff fixes are applied and
must be re-staged if anything changed) and rejects non-Conventional commit
messages. `git commit --no-verify` bypasses them in an emergency — CI still checks.

## FastAPI starter (`--backend`)

```text
pyproject.toml            fastapi, uvicorn[standard], pydantic-settings; hatchling build (src layout)
src/app/
  main.py                 create_app() factory + `app` ASGI entry point
  settings.py             pydantic-settings: ENVIRONMENT, DEBUG, PORT, version from the installed dist
  health.py               GET /health → { status, version, uptime }  (same shape as the Node/.NET starters)
tests/test_health.py      TestClient smoke test
Dockerfile                uv multi-stage build → python:3.13-slim, non-root, HEALTHCHECK on /health
.dockerignore, .env.example
```

```bash
cp .env.example .env
uv run uvicorn app.main:app --reload     # http://localhost:8000/health
docker build -t my-api . && docker run -p 8000:8000 my-api
```

The Dockerfile copies `uv.lock` — commit the lock (`uv sync` creates it).

## CI

**GitHub Actions** (`.github/workflows/ci.yml`, Python variant):
`setup-uv` (reads `.python-version`, caches) → `uv sync --locked --all-groups` →
`pip-audit` (non-blocking) → `ruff check` → `ruff format --check` → `mypy` →
markdownlint → `pytest` (exit code 5 "no tests" is accepted). CodeQL runs with
`languages: python`; Dependabot uses the `uv` ecosystem.

**Azure Pipelines** (`azure-pipelines.yml`, Python variant): the same steps with the
uv installer script, an `UV_CACHE_DIR` cache, and JUnit results published to the
run. See the [Azure DevOps guide](azure-devops.md).

`--locked` fails when `uv.lock` is missing or stale — commit the lock and run
`uv lock` after editing dependencies (the `uv-lock` pre-commit hook does this).

## Releases

- **GitHub** — release-please with `release-type: python` bumps
  `[project] version` in `pyproject.toml`, writes `CHANGELOG.md` and creates the
  tag + release when the release PR is merged.
- **Azure Repos** — `.azuredevops/pipelines/release.yml` runs
  `cz bump --changelog --files-only`, refreshes `uv.lock`, commits
  `chore(release): vX.Y.Z`, tags and pushes. Run it manually from `main`
  (parameters: increment `AUTO|MAJOR|MINOR|PATCH`, dry run).

`[tool.commitizen]` uses `major_version_zero = true`, so while the project is
`0.x` a breaking change bumps the minor version — the same rule as devkit's
release-please config (`bump-minor-pre-major`).

## Dependency updates

GitHub: Dependabot (`package-ecosystem: uv` + `github-actions`, weekly, minor/patch
grouped). Azure Repos: Renovate in a scheduled pipeline (`renovate.json` groups
minor/patch the same way).

## Adopting in an existing repo

`devkit init --python` never rewrites an existing `pyproject.toml`. It appends each
devkit-managed table that is missing — `[dependency-groups]`, `[tool.ruff]` (with
its sub-tables), `[tool.mypy]`, `[tool.pytest.ini_options]`, `[tool.coverage.*]`,
`[tool.commitizen]` — and leaves tables you already have untouched (the log says
`[tool.ruff] already present`). Everything else is copied only if absent.

Expect the first `make check` on a legacy codebase to fail: Ruff and mypy strict
are deliberately opinionated. Typical first steps:

1. `uv run ruff check . --fix && uv run ruff format .` and commit the reformat.
2. Silence rules you disagree with in `[tool.ruff.lint] ignore`.
3. Relax mypy per module rather than globally:

   ```toml
   [[tool.mypy.overrides]]
   module = ["legacy.*", "scripts.*"]
   ignore_errors = true
   ```

If the repo uses `requirements.txt`/Poetry rather than uv, keep it: Ruff, mypy,
pytest and commitizen read `pyproject.toml` regardless. Replace the `uv sync`
steps in CI/Makefile with your installer and drop the `uv-lock` hook.

## Customising

| Want to…                  | Do this                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| Change the Python version | Edit `.python-version` (uv, CI and the Dockerfile base image tag)                           |
| Add/remove Ruff rules     | `[tool.ruff.lint] select / ignore`; per-file exceptions under `per-file-ignores`            |
| Turn off mypy strict      | `[tool.mypy] strict = false`, or use `[[tool.mypy.overrides]]`                              |
| Add a pre-commit hook     | Append to `.pre-commit-config.yaml`; run `uv run pre-commit autoupdate` to bump pins        |
| Restrict commit scopes    | commitizen: add a custom rule set or use `cz check` with a regex (`[tool.commitizen] name`) |
| Publish a package         | Add a `[build-system]`, then `uv build` + `uv publish` in the release pipeline              |
