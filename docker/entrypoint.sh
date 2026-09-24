#!/bin/sh
set -eu

if [ ! -d /app/data ] || [ ! -w /app/data ]; then
  echo "青笺数据目录 /app/data 不可写，请检查宿主机目录权限。" >&2
  exit 1
fi

alembic upgrade head

exec uvicorn backend.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 1 \
  --proxy-headers \
  --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-*}"
