# ```markdown

# \# Sandalis Backend v2.0

# 

# Асинхронный backend для Sandalis Web на \*\*FastAPI + SQLAlchemy 2.0 + asyncpg + Alembic\*\*.

# 

# Проект рассчитан на работу с:

# 

# \- PostgreSQL / Supabase;

# \- Render Free;

# \- shared database / shared schema multi-tenancy;

# \- RBAC внутри клана;

# \- модульной i18n;

# \- строгой изоляцией данных между кланами.

# 

# Frontend на Next.js находится отдельно и в рамках backend-работ не изменяется.

# 

# \---

# 

# \## Текущий статус

# 

# Backend v2.0 уже содержит:

# 

# \- `health`;

# \- `auth`;

# \- `orders`;

# \- `catalog/items`;

# \- `codes`;

# \- `stockpiles`;

# \- `timers`;

# \- clan multi-tenancy;

# \- RBAC;

# \- i18n RU / EN / CS;

# \- Alembic migrations;

# \- Render/Supabase pool tuning.

# 

# Render deploy работает:

# 

# ```text

# /api/v1/health/live

# /api/v1/health/ping

# /api/docs

# ```

# 

# \---

# 

# \## ВАЖНО: Discord OAuth должен быть возвращён

# 

# На текущем этапе backend имеет рабочую инфраструктуру авторизации:

# 

# \- JWT;

# \- dev-token;

# \- clan-token;

# \- invite/redeem-code;

# \- `/auth/me`.

# 

# Но старый полноценный Discord OAuth flow был временно исключён при переходе на backend v2.0.

# 

# \### Discord OAuth — обязательный P0 follow-up

# 

# Перед production-использованием необходимо вернуть авторизацию через Discord.

# 

# Обязательные endpoints:

# 

# ```text

# GET  /api/v1/auth/discord/login

# GET  /api/v1/auth/discord/callback

# POST /api/v1/auth/logout

# GET  /api/v1/auth/me

# ```

# 

# Ожидаемый flow:

# 

# 1\. Пользователь нажимает "Войти через Discord".

# 2\. Backend создаёт OAuth `state` и сохраняет его в secure cookie/session.

# 3\. Backend редиректит пользователя на Discord OAuth.

# 4\. Discord возвращает пользователя на `/api/v1/auth/discord/callback`.

# 5\. Backend валидирует `state`.

# 6\. Backend получает Discord access token.

# 7\. Backend запрашивает Discord user profile.

# 8\. Backend создаёт/обновляет `User`.

# 9\. Backend находит или создаёт `ClanMembership`.

# 10\. Backend выпускает JWT с:

# &#x20;   - `sub`;

# &#x20;   - `clan\_id`;

# &#x20;   - `role`;

# &#x20;   - scopes;

# &#x20;   - `exp`;

# &#x20;   - `iss`;

# &#x20;   - `aud`.

# 11\. JWT кладётся в secure cookie или возвращается клиенту.

# 12\. `/auth/me` возвращает текущего пользователя, роль и scopes.

# 

# Минимальная схема Discord identity:

# 

# ```text

# User.id = discord\_user\_id

# User.display\_name = Discord username/global\_name

# User.preferred\_locale = optional

# ```

# 

# Текущая RBAC-модель уже готова:

# 

# ```text

# Clan

# User

# ClanMembership

# ClanApiToken

# ClanInviteCode

# ```

# 

# Для Discord OAuth нужно добавить только сам OAuth-service, state-validation и callback-route.

# 

# \---

# 

# \## Архитектура backend

# 

# Структура:

# 

# ```text

# backend/

# ├── app/

# │   ├── api/

# │   │   ├── deps.py

# │   │   └── v1/

# │   │       ├── auth.py

# │   │       ├── codes.py

# │   │       ├── health.py

# │   │       ├── items.py

# │   │       ├── orders.py

# │   │       ├── router.py

# │   │       ├── stockpiles.py

# │   │       └── timers.py

# │   ├── core/

# │   │   ├── config.py

# │   │   ├── db.py

# │   │   ├── errors.py

# │   │   ├── i18n/

# │   │   ├── locales/

# │   │   ├── permissions.py

# │   │   ├── security.py

# │   │   └── tenancy.py

# │   ├── domain/

# │   │   ├── auth/

# │   │   ├── catalog/

# │   │   ├── production/

# │   │   ├── stockpiles/

# │   │   └── timers/

# │   ├── models/

# │   ├── schemas/

# │   ├── services/

# │   └── main.py

# ├── migrations/

# ├── tests/

# ├── alembic.ini

# ├── pyproject.toml

# └── requirements.txt

# ```

# 

# Основной принцип:

# 

# ```text

# api/v1 → services → models/db

# &#x20;        ↓

# &#x20;     domain logic

# ```

# 

# \---

# 

# \## Multi-tenancy

# 

# Используется схема:

# 

# ```text

# Shared Database

# Shared Schema

# Discriminator Column

# ```

# 

# Клановые таблицы имеют:

# 

# ```python

# clan\_id: Mapped\[str] = mapped\_column(String(64), index=True, nullable=False)

# ```

# 

# Ключевые файлы:

# 

# ```text

# app/models/base.py

# app/core/tenancy.py

# app/services/base.py

# ```

# 

# \### ClanScopedMixin

# 

# Все клановые сущности должны наследоваться от:

# 

# ```python

# ClanScopedMixin

# ```

# 

# Примеры клановых сущностей:

# 

# ```text

# Order

# Stockpile

# StockpileItem

# Timer

# ClanMembership

# ClanApiToken

# ClanInviteCode

# ```

# 

# Глобальные справочники не должны иметь `clan\_id`.

# 

# Пример:

# 

# ```text

# CatalogItem

# ```

# 

# \---

# 

# \## Изоляция данных

# 

# Изоляция реализована на нескольких уровнях:

# 

# 1\. `with\_loader\_criteria` для автоматической фильтрации ORM-запросов;

# 2\. `before\_flush` guard для записи;

# 3\. `ClanScopedService.\_scoped()`;

# 4\. `ClanScopedService.\_get\_scoped()`;

# 5\. RBAC на уровне роутеров.

# 

# Файл:

# 

# ```text

# app/core/tenancy.py

# ```

# 

# Изоляция должна гарантировать:

# 

# \- клан A не видит данные клана B;

# \- клан A не может изменить данные клана B;

# \- нельзя подменить `clan\_id`;

# \- новые записи автоматически получают `clan\_id` из текущего контекста.

# 

# \---

# 

# \## RBAC

# 

# Файлы:

# 

# ```text

# app/core/permissions.py

# app/api/deps.py

# app/models/rbac.py

# ```

# 

# Роли:

# 

# ```text

# owner

# admin

# officer

# member

# guest

# ```

# 

# Scopes:

# 

# ```text

# orders:read

# orders:write

# orders:delete

# stockpiles:read

# stockpiles:write

# timers:read

# timers:write

# catalog:read

# clan:members:read

# clan:members:write

# clan:settings:write

# ```

# 

# Использование в роутерах:

# 

# ```python

# dependencies=\[Depends(PermissionChecker(\[Scopes.ORDERS\_READ]))]

# ```

# 

# Или:

# 

# ```python

# principal: Annotated\[

# &#x20;   Principal,

# &#x20;   Depends(PermissionChecker(\[Scopes.ORDERS\_WRITE]))

# ]

# ```

# 

# \---

# 

# \## Auth

# 

# Текущие auth-возможности:

# 

# ```text

# GET  /api/v1/auth/me

# POST /api/v1/auth/dev-token

# POST /api/v1/auth/redeem-code

# POST /api/v1/auth/clan-token

# GET  /api/v1/auth/invites

# POST /api/v1/auth/invites

# DELETE /api/v1/auth/invites/{invite\_id}

# ```

# 

# \### Current auth methods

# 

# Backend сейчас поддерживает:

# 

# \- Bearer JWT;

# \- session cookie;

# \- `X-Clan-Token`;

# \- dev-token для локальной разработки;

# \- invite/redeem-code для вступления в клан.

# 

# \### Required auth follow-up

# 

# Нужно вернуть Discord OAuth.

# 

# Файлы, которые нужно добавить/расширить:

# 

# ```text

# app/api/v1/auth.py

# app/services/auth.py

# app/core/security.py

# app/models/rbac.py или отдельная oauth/session модель

# app/schemas/auth.py

# app/domain/auth/locales/

# ```

# 

# Минимальные env-переменные для Discord:

# 

# ```env

# DISCORD\_API\_BASE\_URL=https://discord.com/api/v10

# DISCORD\_CLIENT\_ID=

# DISCORD\_CLIENT\_SECRET=

# DISCORD\_REDIRECT\_URI=http://localhost:8000/api/v1/auth/discord/callback

# FRONTEND\_URL=http://localhost:3000

# SESSION\_COOKIE\_NAME=sindaris\_session

# SESSION\_TTL\_MINUTES=30

# COOKIE\_SECURE=true

# COOKIE\_SAMESITE=lax

# ```

# 

# \---

# 

# \## Catalog / Items

# 

# Глобальный справочник предметов.

# 

# Endpoints:

# 

# ```text

# GET /api/v1/items

# GET /api/v1/items/{code}

# GET /api/v1/codes

# ```

# 

# `/codes` сохранён как legacy alias старого backend для поиска игровых кодов предметов.

# 

# Модель:

# 

# ```text

# CatalogItem

# ```

# 

# Поля:

# 

# ```text

# code

# name

# english\_name

# category

# icon\_url

# crate\_size

# production\_time

# is\_active

# ```

# 

# `CatalogItem` не имеет `clan\_id`.

# 

# \---

# 

# \## Orders

# 

# Endpoints:

# 

# ```text

# GET    /api/v1/orders

# POST   /api/v1/orders

# GET    /api/v1/orders/{order\_id}

# PATCH  /api/v1/orders/{order\_id}

# DELETE /api/v1/orders/{order\_id}

# POST   /api/v1/orders/{order\_id}/status

# ```

# 

# Защита:

# 

# ```text

# orders:read

# orders:write

# orders:delete

# ```

# 

# Orders являются clan-scoped.

# 

# \---

# 

# \## Stockpiles

# 

# Endpoints:

# 

# ```text

# GET    /api/v1/stockpiles

# POST   /api/v1/stockpiles

# GET    /api/v1/stockpiles/{stockpile\_id}

# PATCH  /api/v1/stockpiles/{stockpile\_id}

# DELETE /api/v1/stockpiles/{stockpile\_id}

# 

# POST   /api/v1/stockpiles/{stockpile\_id}/items

# PATCH  /api/v1/stockpiles/{stockpile\_id}/items/{item\_code}

# DELETE /api/v1/stockpiles/{stockpile\_id}/items/{item\_code}

# ```

# 

# Защита:

# 

# ```text

# stockpiles:read

# stockpiles:write

# ```

# 

# Stockpile и StockpileItem являются clan-scoped.

# 

# \---

# 

# \## Timers

# 

# Endpoints:

# 

# ```text

# GET    /api/v1/timers

# POST   /api/v1/timers

# GET    /api/v1/timers/{timer\_id}

# PATCH  /api/v1/timers/{timer\_id}

# DELETE /api/v1/timers/{timer\_id}

# ```

# 

# Защита:

# 

# ```text

# timers:read

# timers:write

# ```

# 

# Timer является clan-scoped.

# 

# Поддерживается новый и legacy-формат:

# 

# ```text

# ends\_at

# target\_timestamp

# type

# duration\_seconds

# ```

# 

# \---

# 

# \## i18n

# 

# Файлы:

# 

# ```text

# app/core/i18n/

# app/core/locales/

# app/domain/\*/locales/

# ```

# 

# Поддерживаемые языки:

# 

# ```text

# ru

# en

# cs

# ```

# 

# `cz` нормализуется в `cs`.

# 

# Язык определяется из:

# 

# ```text

# X-Locale

# Accept-Language

# ```

# 

# Домены переводов:

# 

# ```text

# core

# auth

# catalog

# production

# stockpiles

# timers

# ```

# 

# \---

# 

# \## Database / Supabase

# 

# Backend использует PostgreSQL через asyncpg.

# 

# Рекомендуемый Supabase URL для Render — pooler:

# 

# ```env

# DATABASE\_URL=postgresql+asyncpg://postgres.<PROJECT\_REF>:<PASSWORD>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres

# DB\_USE\_PGBOUNCER=false

# ```

# 

# Для transaction pooler на `6543`:

# 

# ```env

# DB\_USE\_PGBOUNCER=true

# ```

# 

# \---

# 

# \## Render Free оптимизация

# 

# Файл:

# 

# ```text

# app/core/db.py

# ```

# 

# Параметры пула:

# 

# ```python

# pool\_size=3

# max\_overflow=2

# pool\_recycle=1800

# pool\_pre\_ping=True

# ```

# 

# Дополнительно:

# 

# ```text

# pool\_use\_lifo

# pool\_timeout

# run\_with\_retry

# warmup

# ```

# 

# Health endpoints:

# 

# ```text

# GET /api/v1/health/live

# GET /api/v1/health/ping

# ```

# 

# `/ping` выполняет:

# 

# ```sql

# SELECT 1

# ```

# 

# \---

# 

# \## Environment variables

# 

# Минимум для локального запуска:

# 

# ```env

# ENV=local

# DATABASE\_URL=postgresql+asyncpg://postgres.<PROJECT\_REF>:<PASSWORD>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres

# DB\_USE\_PGBOUNCER=false

# 

# JWT\_SECRET=change-me

# JWT\_ALG=HS256

# JWT\_ISSUER=sandalis

# JWT\_AUDIENCE=sandalis-web

# 

# API\_V1\_PREFIX=/api/v1

# DEFAULT\_LOCALE=en

# SUPPORTED\_LOCALES=\["ru","en","cs"]

# I18N\_HOT\_RELOAD=false

# 

# CORS\_ORIGINS=\["http://localhost:3000"]

# FRONTEND\_URL=http://localhost:3000

# 

# SESSION\_COOKIE\_NAME=sindaris\_session

# SESSION\_TTL\_MINUTES=30

# COOKIE\_SECURE=false

# COOKIE\_SAMESITE=lax

# 

# DISCORD\_API\_BASE\_URL=https://discord.com/api/v10

# DISCORD\_CLIENT\_ID=

# DISCORD\_CLIENT\_SECRET=

# DISCORD\_REDIRECT\_URI=http://localhost:8000/api/v1/auth/discord/callback

# ```

# 

# Для Render:

# 

# ```env

# ENV=prod

# COOKIE\_SECURE=true

# PYTHON\_VERSION=3.12.8

# ```

# 

# \---

# 

# \## Local development

# 

# ```bash

# cd backend

# python -m venv .venv

# ```

# 

# Windows PowerShell without activating venv:

# 

# ```powershell

# .\\.venv\\Scripts\\python.exe -m pip install --upgrade pip

# .\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt

# ```

# 

# Run migrations:

# 

# ```powershell

# .\\.venv\\Scripts\\python.exe -m alembic upgrade head

# ```

# 

# Run app:

# 

# ```powershell

# .\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --reload

# ```

# 

# Open:

# 

# ```text

# http://127.0.0.1:8000/api/docs

# http://127.0.0.1:8000/api/v1/health/live

# http://127.0.0.1:8000/api/v1/health/ping

# ```

# 

# \---

# 

# \## Tests

# 

# ```powershell

# cd backend

# .\\.venv\\Scripts\\python.exe -m pytest -q

# ```

# 

# Expected:

# 

# ```text

# 50 passed

# ```

# 

# Тесты покрывают:

# 

# \- auth;

# \- catalog/items;

# \- legacy codes;

# \- orders;

# \- stockpiles;

# \- timers;

# \- tenancy isolation;

# \- RBAC;

# \- i18n;

# \- health;

# \- timer calculations.

# 

# \---

# 

# \## Alembic

# 

# Migrations live in:

# 

# ```text

# backend/migrations/

# ```

# 

# Current chain:

# 

# ```text

# 0001\_initial

# 0002\_clan\_scope\_backfill

# 0003\_domain\_modules

# ```

# 

# Apply:

# 

# ```bash

# python -m alembic upgrade head

# ```

# 

# Current revision:

# 

# ```bash

# python -m alembic current

# ```

# 

# \---

# 

# \## Render deploy

# 

# Recommended settings:

# 

# \### Root Directory

# 

# ```text

# backend

# ```

# 

# \### Build Command

# 

# ```bash

# python -m pip install --upgrade pip \&\& python -m pip install -r requirements.txt

# ```

# 

# \### Start Command

# 

# ```bash

# python -m alembic upgrade head \&\& python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1

# ```

# 

# \### Health Check Path

# 

# ```text

# /api/v1/health/live

# ```

# 

# \---

# 

# \## Public URLs

# 

# Production:

# 

# ```text

# https://sandalis-web-v2-0.onrender.com/api/docs

# https://sandalis-web-v2-0.onrender.com/api/v1/health/live

# https://sandalis-web-v2-0.onrender.com/api/v1/health/ping

# ```

# 

# \---

# 

# \## Known breaking changes

# 

# Backend v2.0 is a new API architecture.

# 

# Potential breaking points for old frontend:

# 

# \- auth flow changed temporarily;

# \- Discord OAuth is not yet restored;

# \- some response DTOs may differ from old backend;

# \- protected endpoints now require JWT or clan-token;

# \- clan isolation is mandatory.

# 

# Legacy compatibility preserved where practical:

# 

# \- `/api/v1/codes` still behaves as item-code search alias;

# \- timers expose legacy fields like `type` and `target\_timestamp`.

# 

# \---

# 

# \## Roadmap

# 

# \### P0 — must-have before production

# 

# \- Restore Discord OAuth login.

# \- Add Discord login button integration on frontend if needed.

# \- Ensure Discord user maps to `User` and `ClanMembership`.

# \- Add secure state cookie and CSRF protection for OAuth callback.

# \- Add logout flow.

# \- Add production tests for Discord callback mocking.

# 

# \### P1

# 

# \- Admin UI/API for clan membership management.

# \- Seed script for first clan/admin.

# \- Catalog import script for full Foxhole item database.

# \- Better frontend compatibility DTOs.

# \- Token refresh/session rotation.

# 

# \### P2

# 

# \- Reintroduce workers if needed:

# &#x20; - war\_import;

# &#x20; - ffmpeg;

# &#x20; - S3/media processing.

# \- Add background job runner separate from Render web service.

# \- Add cache layer for catalog search if catalog grows large.

# 

# \### P3

# 

# \- Observability:

# &#x20; - structured logs;

# &#x20; - request IDs;

# &#x20; - Sentry/OpenTelemetry;

# &#x20; - DB timing metrics.

# 

# \---

# 

# \## Discord OAuth Definition of Done

# 

# Discord auth is considered restored only when all are true:

# 

# \- `GET /api/v1/auth/discord/login` redirects to Discord.

# \- `GET /api/v1/auth/discord/callback` validates `state`.

# \- Discord user profile is fetched from Discord API.

# \- `User` is created/updated.

# \- `ClanMembership` is resolved.

# \- JWT is issued with correct `clan\_id`, role and scopes.

# \- Cookie mode works.

# \- Bearer-token mode works.

# \- `/api/v1/auth/me` works after Discord login.

# \- Invalid state returns localized error.

# \- Expired/unknown user returns localized error.

# \- Tests cover success and failure paths.

# \- No Discord secrets are committed.

# 

# \---

# 

# \## Security notes

# 

# Never commit:

# 

# ```text

# .env

# DATABASE\_URL

# JWT\_SECRET

# DISCORD\_CLIENT\_SECRET

# S3\_SECRET\_KEY

# SUPABASE\_SECRET\_KEY

# ```

# 

# Check before commit:

# 

# ```bash

# git status --short

# git diff --cached --name-only

# ```

# 

# `.env` must be ignored.

# 

# \---

# 

# \## Maintainer notes

# 

# The backend is designed to fail closed:

# 

# \- missing clan context blocks clan-scoped queries;

# \- cross-clan mutation raises an error;

# \- RBAC denies missing scopes;

# \- health/ping is intentionally lightweight;

# \- global catalog remains shared to save Supabase free-tier storage.

# ```

