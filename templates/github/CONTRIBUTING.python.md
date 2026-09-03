# Contributing

Thanks for contributing! This repository uses shared tooling from
[`devkit`](https://github.com/vpnsin-labs/devkit) — uv, Ruff, mypy, pytest,
commitizen, pre-commit hooks and CI/release pipelines.

## Getting started

- **Python** (version pinned in `.python-version`) and [**uv**](https://docs.astral.sh/uv/)
- `uv sync --all-groups` (creates `.venv` and `uv.lock`)
- `uv run pre-commit install` (git hooks)

## Development workflow

1. Branch off `main` (or `dev`):
   `git checkout -b feat/short-description`
2. Make your changes. On commit, the pre-commit hooks auto-fix and lint staged
   files and validate the commit message.
3. Before pushing, verify locally (`make check` runs all four):

   ```bash
   uv run ruff check .
   uv run ruff format --check .
   uv run mypy .
   uv run pytest
   ```

## Commit messages — Conventional Commits (required)

The `commit-msg` hook (commitizen) enforces them, and {{RELEASE_TOOL}} uses them to
compute the version bump and changelog.

| Type                                                                 | Effect        |
| -------------------------------------------------------------------- | ------------- |
| `feat:`                                                              | minor release |
| `fix:`                                                               | patch release |
| `docs:` `chore:` `refactor:` `test:` `ci:` `build:` `perf:` `style:` | no release    |
| `feat!:` / `BREAKING CHANGE:` footer                                 | major release |

Example: `feat(api): add password reset flow`

## Pull requests

- Keep PRs focused and fill in the PR template.
- Make sure CI is green.
- {{REVIEWERS}}

## Releases

{{RELEASE_FLOW}}
