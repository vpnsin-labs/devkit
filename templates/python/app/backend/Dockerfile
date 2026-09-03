# syntax=docker/dockerfile:1

# ---- build: resolve + install dependencies into /app/.venv with uv ----
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS build
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
# Dependencies first (cached layer) — needs a committed uv.lock (`uv lock`).
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-dev
# Then the project itself.
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev

# ---- runtime: slim image, non-root, no uv ----
FROM python:3.13-slim-bookworm AS runtime
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 PORT=8000
RUN useradd --create-home --uid 10001 app
COPY --from=build --chown=app:app /app /app
USER app
EXPOSE 8000

# Probe /health with the stdlib (no curl/wget in slim images). urlopen raises on non-2xx.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import os, urllib.request as u; u.urlopen('http://localhost:%s/health' % os.environ.get('PORT', '8000'))"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
