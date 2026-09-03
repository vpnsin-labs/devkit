# {{PROJECT_NAME}}

<!-- {{BADGES}} -->
> One-line description of what this project does.

## Features

- …
- …

## Getting started

### Prerequisites

- Python (version pinned in `.python-version`)
- [uv](https://docs.astral.sh/uv/) — environment + lockfile manager

### Install

```bash
uv sync --all-groups                                                   # creates .venv + uv.lock
uv run pre-commit install # git hooks
```

### Develop

```bash
uv run uvicorn app.main:app --reload   # FastAPI starter → http://localhost:8000/health
```

## Tasks

| Command                        | Description                                  |
| ------------------------------ | -------------------------------------------- |
| `make lint`                    | Ruff lint + format check                     |
| `make format`                  | Ruff autofix + format                        |
| `make type-check`              | mypy (strict)                                |
| `make test`                    | pytest                                       |
| `make check`                   | Everything CI runs                           |
| `uv run cz bump --changelog`   | Release: bump version + CHANGELOG (from main) |

Without `make` (e.g. Windows), run the underlying commands: `uv run ruff check .`,
`uv run ruff format --check .`, `uv run mypy .`, `uv run pytest`.

## Contributing

See [CONTRIBUTING]({{CONTRIBUTING_PATH}}). Commits follow
[Conventional Commits](https://www.conventionalcommits.org/); releases are
automated with {{RELEASE_TOOL}}.

## Security

See [SECURITY]({{SECURITY_PATH}}) for how to report vulnerabilities.

## License

<!-- e.g. MIT © Year Author -->
