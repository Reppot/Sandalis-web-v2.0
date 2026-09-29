Sandalis — монорепозиторий: Next.js + FastAPI + PostgreSQL.

Запуск локально (нужен только Docker):
    docker compose -f infra/docker-compose.yml up

Или вручную, в двух терминалах:
    cd frontend && npm run dev
    cd backend && uvicorn app.main:app --reload

Структура, правила и контракт — в docs/ (openapi.yaml, decisions/).
Снимки кода для ИИ — артефакты CI, а не файлы в репозитории.
