"""Application factory and ASGI entry point.

Run locally:  uv run uvicorn app.main:app --reload
"""

from __future__ import annotations

from fastapi import FastAPI

from app.health import router as health_router
from app.settings import settings


def create_app() -> FastAPI:
    """Build the FastAPI app. Kept free of side effects so tests can import it."""
    app = FastAPI(title=settings.app_name, version=settings.version, debug=settings.debug)
    app.include_router(health_router)
    return app


app = create_app()
