"""GET /health — liveness probe reporting status, version and uptime.

Mirrors the devkit Node and .NET starters so orchestrator probes are uniform.
"""

from __future__ import annotations

import time

from fastapi import APIRouter
from pydantic import BaseModel

from app.settings import settings

router = APIRouter(tags=["health"])
_STARTED_AT = time.monotonic()


class Health(BaseModel):
    status: str
    version: str
    uptime: float


@router.get("/health")
def health() -> Health:
    return Health(
        status="ok",
        version=settings.version,
        uptime=round(time.monotonic() - _STARTED_AT, 3),
    )
