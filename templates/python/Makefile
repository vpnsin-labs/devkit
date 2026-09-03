# Common tasks — the same gates CI runs. On Windows without make, run the
# `uv run …` commands directly (or use make from Git Bash / WSL).
.PHONY: install lint format type-check test check

install: ## sync deps (creates .venv + uv.lock) and install git hooks
	uv sync --all-groups
	uv run pre-commit install

lint: ## ruff lint + format check
	uv run ruff check .
	uv run ruff format --check .

format: ## autofix lint + format
	uv run ruff check . --fix
	uv run ruff format .

type-check: ## mypy (strict)
	uv run mypy .

test: ## pytest
	uv run pytest

check: lint type-check test ## everything CI runs
