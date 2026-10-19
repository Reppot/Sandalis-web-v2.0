#!/usr/bin/env bash
# Запуск сайта в одном контейнере: миграции → сиды → FastAPI (внутренний) + Next (публичный).
# Если любой из процессов падает — контейнер завершается, Render перезапускает его.
set -euo pipefail

cd /app/backend
python -m alembic upgrade head
python -m app.seed

python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 &
api_pid=$!

cd /app/web
HOSTNAME=0.0.0.0 PORT="${PORT:-10000}" node server.js &
web_pid=$!

trap 'kill -TERM "$api_pid" "$web_pid" 2>/dev/null' TERM INT
wait -n "$api_pid" "$web_pid"
status=$?
kill -TERM "$api_pid" "$web_pid" 2>/dev/null || true
exit "$status"
