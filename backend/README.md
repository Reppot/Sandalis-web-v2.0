# Sandalis Web v2.0 — Backend (FastAPI)

Асинхронный бэкенд: **мультиарендность кланов** (Discriminator Column, Shared DB /
Shared Schema), **RBAC внутри клана**, **модульная i18n** (RU/EN/CS), перенесённые
из старого backend домены **auth / catalog / stockpiles / timers / codes**.
Заточен под бесплатные Render + Supabase (пул ≤ 5 коннектов, pre_ping,
словари в JSON, а не в БД).

## Быстрый старт (локально)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # прописать DATABASE_URL и JWT_SECRET

python -m alembic upgrade head
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

- Swagger UI: http://127.0.0.1:8000/api/docs
- Render health check: `GET /api/v1/health/live` (без БД)
- Keep-alive для cron-job.org (раз в 10 мин): `GET /api/v1/health/ping` (`SELECT 1`)
- Тесты: нужен локальный PostgreSQL; БД задаётся в `tests/conftest.py`
  (env `DATABASE_URL=…/sandalis_test`, можно переопределить перед запуском):
  `python -m pytest -q`

## Render

```
Build Command: python -m pip install --upgrade pip && python -m pip install -r requirements.txt
Start Command: python -m alembic upgrade head && python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
```

Один воркер = максимум 5 коннектов (`pool_size=3 + max_overflow=2`) — потолок
бесплатного Supabase. Фоновые воркеры в web start command не добавляем.

## Модули API (все защищённые — JWT Bearer / кука `sandalis_session` / `X-Clan-Token`)

| Группа | Пути | Скоупы |
|---|---|---|
| health | `GET /health/live`, `GET /health/ping` | публичные |
| auth | `GET /auth/me` · `POST /auth/dev-token` (ENV≠prod или `X-Dev-Auth-Key`) · `POST /auth/redeem-code` (публичный) · `POST /auth/clan-token` | `clan:settings:write` для clan-token |
| auth.invites | `GET/POST /auth/invites`, `DELETE /auth/invites/{id}` | `clan:members:read` (officer+) / `clan:members:write` (admin) |
| orders | `GET/POST /orders`, `GET/PATCH/DELETE /orders/{id}`, `POST /orders/{id}/status` | `orders:read/write/delete` (delete: officer+) |
| catalog | `GET /items`, `GET /items/{code}` (поиск `query`, `category`, `active_only`) | `catalog:read` (есть и у guest) |
| codes (legacy v1) | `GET /codes?query=&category=&limit=` — плоский список до 5000 | `catalog:read` |
| stockpiles | CRUD `/stockpiles`, позиции `POST/PATCH/DELETE /stockpiles/{id}/items[/{code}]` | `stockpiles:read/write` |
| timers | CRUD `/timers`, фильтр `state=active/expired/completed`, `stockpile_id` | `timers:read` / `timers:write` (officer+) |

JWT выпускается `POST /auth/dev-token` (dev/infra) или `POST /auth/redeem-code`
(вступление по инвайту). Discord OAuth старого backend — сознательный follow-up:
его session-модель заменена стейтless JWT, поле личности `user_id` уже готово
принять discord id.

## Совместимость со старым API (v1)

- `GET /api/v1/codes` — тот же плоский формат (id == code, `name`, `english_name`,
  `icon_url`, `production_time`); теперь требует авторизацию (у guest есть доступ).
- Таймеры: принимают как `ends_at` (ISO-8601, tz-aware), так и legacy
  `target_timestamp` (мс) + `duration_seconds` (дефолты: `type=stockpile_decay`,
  172800 c). Ответ содержит legacy-поля `type`, `target_timestamp`,
  `remaining_seconds`, `remaining_display` (ЧЧ:ММ:СС), `urgency`
  (normal/warning/critical/expired) + новые `progress`, `starts_at`, `ends_at`.
- Breaking changes: формы ошибок → единый `{error:{code,message,locale,params}}`;
  таблица сессий Discord удалена (JWT стейтless); все ранее публичные
  GET-эндпоинты стали авторизованными.

## Архитектурные инварианты

- Все таблицы с клановыми данными наследуют `ClanScopedMixin`
  (`orders`, `stockpiles`, `stockpile_items`, `timers`, `clan_memberships`,
  `clan_api_tokens`, `clan_invite_codes`); фильтрация — глобальная
  (`with_loader_criteria`) + гвард `before_flush`. Глобальные справочники
  (`catalog_items`, `clans`, `users`) — без `clan_id`.
- Сервисы работают через `ClanSession` + `Principal` + `Translator`
  (bootstrap-аутентификация — единственное осознанное исключение, внутри
  `bypass_clan_filter()` в core-слое).
- Ошибки несут ключ перевода; словари — `app/domain/<domain>/locales/{ru,en,cs}.json`,
  общие — `app/core/locales/`; `cz` нормализуется в `cs`.
- Миграции — только `backend/migrations` (0001 → 0002 → 0003).

## Follow-up (вне этого объёма)

Discord OAuth на стейтless JWT; Postgres RLS как 4-й рубеж; `app/workers`
(`war_import`, `ffmpeg`) как отдельный сервис; TTL-очистка закрытых заказов;
rate-limit на `redeem-code` (код — единственный секрет).
