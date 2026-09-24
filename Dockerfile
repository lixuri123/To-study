# syntax=docker/dockerfile:1.7

FROM node:22.23.2-alpine3.24 AS web-build

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build


FROM ghcr.io/astral-sh/uv:0.12.18-python3.13-trixie-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY alembic.ini main.py ./
COPY alembic ./alembic
COPY backend ./backend
COPY scripts ./scripts
COPY docker/entrypoint.sh /usr/local/bin/qingjian-entrypoint
COPY --from=web-build /build/frontend/dist ./frontend/dist

RUN groupadd --gid 10001 qingjian \
    && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /app --shell /usr/sbin/nologin qingjian \
    && mkdir -p /app/data \
    && chown -R qingjian:qingjian /app/data \
    && chmod 755 /usr/local/bin/qingjian-entrypoint

USER qingjian

EXPOSE 8000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).read()"]

ENTRYPOINT ["qingjian-entrypoint"]
