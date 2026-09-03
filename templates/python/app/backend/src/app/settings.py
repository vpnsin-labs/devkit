"""Typed settings loaded from environment variables (and a local .env file)."""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as installed_version

from pydantic_settings import BaseSettings, SettingsConfigDict

# The distribution name from pyproject.toml — used to report the deployed version
# from /health. Falls back to 0.0.0 when the package is not installed (e.g. plain
# `python -m` runs without `uv sync`).
DISTRIBUTION = "{{PROJECT_NAME}}"


def _version() -> str:
    try:
        return installed_version(DISTRIBUTION)
    except PackageNotFoundError:
        return "0.0.0"


class Settings(BaseSettings):
    """Environment-backed configuration. Extend with validated fields as the surface grows."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = DISTRIBUTION
    environment: str = "development"
    debug: bool = False
    port: int = 8000
    version: str = _version()


settings = Settings()
