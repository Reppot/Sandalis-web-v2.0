#!/usr/bin/env bash
# Запуск сайта в одном контейнере: миграции → сиды → FastAPI (внутренний) + Next (публичный).
# Если любой из процессов падает — контейнер завершается, Render перезапускает его.
set -euo pipefail

cd /app/backend
python -m alembic upgrade head
python -m app.seed

api_pid=""
web_pid=""
cleanup() {
  set +e
  if [[ -n "$api_pid" ]]; then kill -TERM "$api_pid" 2>/dev/null || true; fi
  if [[ -n "$web_pid" ]]; then kill -TERM "$web_pid" 2>/dev/null || true; fi
  if [[ -n "$api_pid" ]]; then wait "$api_pid" 2>/dev/null || true; fi
  if [[ -n "$web_pid" ]]; then wait "$web_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 &
api_pid=$!

# Next стартует, когда API уже отвечает: прокси не сыплет ECONNREFUSED в логи
python - <<'EOF'
import time, urllib.request
for _ in range(120):
    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/api/v1/health/live", timeout=2) as response:
            if response.status == 200:
                break
            raise RuntimeError(f"API health returned {response.status}")
    except Exception:
        time.sleep(0.5)
else:
    raise SystemExit("API health check timed out after 60 seconds")
EOF

cd /app/web
HOSTNAME=0.0.0.0 PORT="${PORT:-10000}" node server.js &
web_pid=$!

set +e
wait -n "$api_pid" "$web_pid"
status=$?
set -e
exit "$status"
