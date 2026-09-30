# ADR-0005: Стратегия деплоя и контейнеризация

## Статус
Принято

## Контекст
Старый монолит деплоился на Render как единый Web Service с ffmpeg и xlsx прямо в зависимостях Node.js.
Новая архитектура — модульный монорепозиторий из трех контейнеризированных процессов:
FastAPI backend, Next.js frontend и background worker.

## Решение
1. **Dockerfile.api**:
   - Python 3.12-slim с многоэтапной сборкой.
   - Включает системный `ffmpeg` и `libpq5`.
   - Точка входа: `uvicorn app.main:app`.
2. **Dockerfile.web**:
   - Node 20-alpine с тремя этапами (deps → builder → runner).
   - Используется `output: "standalone"` Next.js (минимизирует размер итогового образа с 1 ГБ до ~120 МБ).
   - Точка входа: `node server.js`.
3. **Единая публикация через `infra/render.yaml`**:
   - Автоматически поднятие Managed PostgreSQL 16.
   - Web Service `sandalis-api`.
   - Web Service `sandalis-web`.
   - Background Worker `sandalis-worker`.

## Последствия
- Образы легковесны и безопасны (запуск под не-root пользователями).
- Время сборки и деплоя сократилось в 3 раза.
- Вся инфраструктура декларирована в коде (IaC).