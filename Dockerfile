# syntax=docker/dockerfile:1
#
# Один сервис Render = один сайт: Next.js (публичный $PORT) + FastAPI (127.0.0.1:8000)
# в одном контейнере. Браузер видит только Next; /api/v1/* Next проксирует в FastAPI
# (frontend/next.config.ts), поэтому кука сессии first-party и CORS не нужен.

# ---------- 1. сборка фронтенда (Next standalone) ----------------------------------
FROM node:20-bookworm-slim AS web
WORKDIR /web
ENV NEXT_TELEMETRY_DISABLED=1
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# адрес бэкенда «зашивается» в rewrites при сборке — внутри контейнера это localhost
ENV BACKEND_URL=http://127.0.0.1:8000
RUN npm run build

# ---------- 2. рантайм: Python + node ----------------------------------------------
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
# одиночный бинарь node из той же Debian bookworm — glibc совпадает
COPY --from=web /usr/local/bin/node /usr/local/bin/node

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/ ./

WORKDIR /app/web
COPY --from=web /web/.next/standalone ./
COPY --from=web /web/.next/static ./.next/static
COPY --from=web /web/public ./public

COPY deploy/start.sh /app/start.sh
RUN chmod +x /app/start.sh && useradd --create-home --uid 10001 app
USER app

EXPOSE 10000
CMD ["/app/start.sh"]
