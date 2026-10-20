```markdown
# Sandalis Backend v2.0

Асинхронный backend для Sandalis Web на **FastAPI + SQLAlchemy 2.0 + asyncpg + Alembic**.

Проект рассчитан на работу с:

- PostgreSQL / Supabase;
- Render Free;
- shared database / shared schema multi-tenancy;
- RBAC внутри клана;
- модульной i18n;
- строгой изоляцией данных между кланами.

Frontend на Next.js находится отдельно и в рамках backend-работ не изменяется.

---

## Текущий статус

Backend v2.0 уже содержит:

- `health`;
- `auth` (включая Discord OAuth: login / callback / logout);
- `orders`;
- `catalog/items`;
- `codes`;
- `stockpiles`;
- `timers`;
- clan multi-tenancy;
- RBAC;
- i18n RU / EN / CS;
- Alembic migrations;
- Render/Supabase pool tuning.

Render deploy работает:

```text
/api/v1/health/live
/api/v1/health/ping
/api/docs
```

---

## Discord OAuth — реализовано (P0 закрыт)

Discord OAuth2 (authorization code, `scope=identify guilds`) возвращён в backend v2.0
в stateless-исполнении: таблица сессий не нужна, личность и клановый контекст
живут в подписанном `state`, а сессия — в stateless JWT внутри session-cookie.

### Endpoints

```text
GET  /api/v1/auth/discord/login      # 302 на Discord (или 503 discord.disabled)
GET  /api/v1/auth/discord/callback   # state -> token -> profile -> JWT
POST /api/v1/auth/logout             # 204, удаляет session-cookie
GET  /api/v1/auth/me                 # работает и по куке, и по Bearer
```

### Flow

1. `GET /auth/discord/login?clan_id=&return_to=` — если `DISCORD_CLIENT_ID` /
   `DISCORD_CLIENT_SECRET` пусты, отвечает `503 discord.disabled` (локализовано).
2. Иначе backend подписывает state (HMAC-SHA256 на `JWT_SECRET`, внутри `clan_id`,
   `return_to`, `nonce`, `exp = now + DISCORD_OAUTH_STATE_TTL_SEC`) и отдаёт 302
   на Discord с `client_id`, `redirect_uri`, `response_type=code`, `scope=identify guilds`.
3. Discord возвращает пользователя на `/api/v1/auth/discord/callback`.
4. Backend проверяет подпись и `exp` state — любая проблема даёт
   `401 discord.state_invalid`, до Discord-API запрос не доходит.
5. `POST {DISCORD_API_BASE_URL}/oauth2/token` (`grant_type=authorization_code`),
   не-2xx -> `502 discord.exchange_failed`.
6. `GET {DISCORD_API_BASE_URL}/users/@me`, не-2xx -> `502 discord.profile_failed`.
7. `User` апсертится: `id = discord_id`, `display_name = global_name or username`,
   `avatar_url = https://cdn.discordapp.com/avatars/{id}/{avatar}.png`.
8. Резолвится клан (все запросы под `bypass_clan_filter()`):
   - `clan_id` из state -> строго требовать membership в этом клане;
   - пользователь владеет Discord-серверами (`GET /users/@me/guilds`, флаг `owner`) ->
     подписанная кука `sindaris_discord_setup` и 302 на `FRONTEND_URL?setup=guild`:
     фронт показывает выбор сервера (`GET/POST /auth/discord/setup`), выбранный
     сервер становится кланом (`clans.discord_guild_id`), пользователь — `owner`;
     старый клан без сервера, где он уже owner, привязывается к серверу (данные сохраняются);
   - иначе последнее активное membership, а если его нет — `403 user.no_clan`
     (вступление — только через кланы с ботом, см. «Роли Discord»).
   - уровень доступа уже вступивших пересчитывается по их текущим ролям Discord;
   - кланы серверов пользователя, где командир подтянул роли (бот добавлен), попадают в
     `joins` экрана выбора: «Вступить в терминал клана …» с ролями пользователя на сервере.
9. Выпускается JWT (`issue_access_token`) с `sub`, `clan_id`, `role`, scopes,
   `exp`, `iss`, `aud`.
10. По умолчанию JWT кладётся в cookie (`HttpOnly`, `Secure=COOKIE_SECURE`,
    `SameSite=COOKIE_SAMESITE`, `Max-Age=SESSION_TTL_MINUTES*60`) и следует 302
    на `FRONTEND_URL` либо на безопасный `return_to` (только относительный путь
    или тот же origin). `?response=json` возвращает `200 TokenResponse` вместо
    редиректа.
11. Ошибки: в redirect-режиме -> `302 FRONTEND_URL?error=<code>`, в json-режиме ->
    стандартный JSON-envelope проекта (`{"error": {code, message, locale}}`).

### Локализация

Ключи домена `auth` в `app/domain/auth/locales/{ru,en,cs}.json`:
`discord.disabled`, `discord.state_invalid`, `discord.exchange_failed`,
`discord.profile_failed`, `discord.signed_in`, `user.not_member`.

### Тесты

`backend/tests/test_discord_auth.py` — 14 кейсов (login 503/302, callback
cookie/json, member/default-clan/no-member, поддельный и просроченный state,
502 на token/profile, logout). Discord не вызывается: httpx-транспорт мокается
`respx`, prod-код получает клиента из фабрики `get_http_client()`.

### Discord Developer Portal

1. https://discord.com/developers/applications -> New Application -> OAuth2.
2. Redirects (оба окружения):

```text
http://localhost:8000/api/v1/auth/discord/callback
https://sandalis-web-v2-0.onrender.com/api/v1/auth/discord/callback
```

3. Scopes: `identify guilds` (email не нужен; guilds — найти серверы во владении).
4. `Client ID` -> `DISCORD_CLIENT_ID`, `Client Secret` -> `DISCORD_CLIENT_SECRET`.
5. «Бот» -> Reset Token -> `DISCORD_BOT_TOKEN` (только для «Роли Discord»: бот добавляется на сервер
   клана без прав кнопкой в кабинете и нужен лишь чтобы прочитать названия ролей).
   Вход запрашивает scopes `identify guilds guilds.members.read`: роли пользователя на сервере
   клана читаются его же токеном, и при входе выдаётся самая старшая сопоставленная роль.

---

## Архитектура backend

Структура:

```text
backend/
├── app/
│   ├── api/
│   │   ├── deps.py
│   │   └── v1/
│   │       ├── auth.py
│   │       ├── codes.py
│   │       ├── health.py
│   │       ├── items.py
│   │       ├── orders.py
│   │       ├── router.py
│   │       ├── stockpiles.py
│   │       └── timers.py
│   ├── core/
│   │   ├── config.py
│   │   ├── db.py
│   │   ├── errors.py
│   │   ├── i18n/
│   │   ├── locales/
│   │   ├── permissions.py
│   │   ├── security.py
│   │   └── tenancy.py
│   ├── domain/
│   │   ├── auth/
│   │   ├── catalog/
│   │   ├── production/
│   │   ├── stockpiles/
│   │   └── timers/
│   ├── models/
│   ├── schemas/
│   ├── services/
│   └── main.py
├── migrations/
├── tests/
├── alembic.ini
├── pyproject.toml
└── requirements.txt
```

Основной принцип:

```text
api/v1 → services → models/db
         ↓
      domain logic
```

---

## Multi-tenancy

Используется схема:

```text
Shared Database
Shared Schema
Discriminator Column
```

Клановые таблицы имеют:

```python
clan_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
```

Ключевые файлы:

```text
app/models/base.py
app/core/tenancy.py
app/services/base.py
```

### ClanScopedMixin

Все клановые сущности должны наследоваться от:

```python
ClanScopedMixin
```

Примеры клановых сущностей:

```text
Order
Stockpile
StockpileItem
Timer
ClanMembership
ClanApiToken
ClanInviteCode
```

Глобальные справочники не должны иметь `clan_id`.

Пример:

```text
CatalogItem
```

---

## Изоляция данных

Изоляция реализована на нескольких уровнях:

1. `with_loader_criteria` для автоматической фильтрации ORM-запросов;
2. `before_flush` guard для записи;
3. `ClanScopedService._scoped()`;
4. `ClanScopedService._get_scoped()`;
5. RBAC на уровне роутеров.

Файл:

```text
app/core/tenancy.py
```

Изоляция должна гарантировать:

- клан A не видит данные клана B;
- клан A не может изменить данные клана B;
- нельзя подменить `clan_id`;
- новые записи автоматически получают `clan_id` из текущего контекста.

---

## RBAC

Файлы:

```text
app/core/permissions.py
app/api/deps.py
app/models/rbac.py
```

Роли:

```text
owner
admin
officer
member
guest
```

Scopes:

```text
orders:read
orders:write
orders:delete
stockpiles:read
stockpiles:write
timers:read
timers:write
catalog:read
clan:members:read
clan:members:write
clan:settings:write
```

Использование в роутерах:

```python
dependencies=[Depends(PermissionChecker([Scopes.ORDERS_READ]))]
```

Или:

```python
principal: Annotated[
    Principal,
    Depends(PermissionChecker([Scopes.ORDERS_WRITE]))
]
```

---

## Auth

Текущие auth-возможности:

```text
GET  /api/v1/auth/me
POST /api/v1/auth/dev-token
POST /api/v1/auth/guest                     # гость: только инструменты/каталог, клан __guest__
GET  /api/v1/auth/discord/setup              # серверы во владении после Discord-входа
POST /api/v1/auth/discord/setup              # {guild_id} -> owner клана | {clan_id}
POST /api/v1/auth/clan-token
GET  /api/v1/clan/discord-roles             # командир: роли сервера и уровни
POST /api/v1/clan/discord-roles/pull        # командир: подтянуть роли через бота
PUT  /api/v1/clan/discord-roles             # командир: {levels: {role_id: basic|medium|high}}
GET  /api/v1/clan/members                   # командир: участники (сервер Discord + терминал) с правами
GET  /api/v1/clan/permissions               # командир: все действия сайта и состав пресетов
```

### Current auth methods

Backend сейчас поддерживает:

- Bearer JWT;
- session cookie (`SESSION_COOKIE_NAME`, ставится Discord-callback'ом);
- `X-Clan-Token`;
- Discord OAuth2 (`scope=identify guilds`) -> JWT/cookie, выбор сервера клана владельцем;
- dev-token для локальной разработки;
- вступление через бота клана: уровни доступа по ролям Discord (basic → member, medium → officer, high → admin,
  custom → выбранные действия из `PERMISSION_GROUPS`; права участника — объединение прав его ролей);
- права = отдельные действия (`app/core/permissions.py`: stockpiles:*, reports:*, timers:*, catalog:read, clan:*);
- гостевой JWT (`gst`) — инструменты и каталог в пустом арендаторе `__guest__`, данные кланов недоступны.

### Discord auth files

```text
app/api/v1/auth.py               # /discord/login, /discord/callback, /logout
app/services/discord_oauth.py    # signed state, token exchange, /users/@me, avatar
app/services/auth.py             # upsert_discord_user / resolve_discord_membership
app/models/rbac.py               # User.avatar_url (миграция 0004)
app/schemas/auth.py              # DiscordTokenResponse, DiscordUserProfile
app/domain/auth/locales/         # discord.* ключи (ru/en/cs)
migrations/versions/0004_discord_oauth.py
tests/test_discord_auth.py
```

Env-переменные Discord и session-cookie:

```env
DISCORD_API_BASE_URL=https://discord.com/api/v10
DISCORD_AUTHORIZE_URL=https://discord.com/oauth2/authorize
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=http://localhost:8000/api/v1/auth/discord/callback
DISCORD_OAUTH_STATE_TTL_SEC=600

FRONTEND_URL=http://localhost:3000
SESSION_COOKIE_NAME=sandalis_session
SESSION_TTL_MINUTES=60
COOKIE_SECURE=false              # prod -> true
COOKIE_SAMESITE=lax              # lax | strict | none

DEFAULT_CLAN_ID=                 # пусто -> 403 user.not_member
DEFAULT_CLAN_ROLE=guest
```

---

## Catalog / Items

Глобальный справочник предметов.

Endpoints:

```text
GET /api/v1/items
GET /api/v1/items/{code}
GET /api/v1/codes
```

`/codes` сохранён как legacy alias старого backend для поиска игровых кодов предметов.

Модель:

```text
CatalogItem
```

Поля:

```text
code
name
english_name
category
icon_url
crate_size
production_time
is_active
```

`CatalogItem` не имеет `clan_id`.

---

## Orders

Endpoints:

```text
GET    /api/v1/orders
POST   /api/v1/orders
GET    /api/v1/orders/{order_id}
PATCH  /api/v1/orders/{order_id}
DELETE /api/v1/orders/{order_id}
POST   /api/v1/orders/{order_id}/status
```

Защита:

```text
orders:read
orders:write
orders:delete
```

Orders являются clan-scoped.

---

## Stockpiles

Endpoints:

```text
GET    /api/v1/stockpiles
POST   /api/v1/stockpiles
GET    /api/v1/stockpiles/{stockpile_id}
PATCH  /api/v1/stockpiles/{stockpile_id}
DELETE /api/v1/stockpiles/{stockpile_id}

POST   /api/v1/stockpiles/{stockpile_id}/items
PATCH  /api/v1/stockpiles/{stockpile_id}/items/{item_code}
DELETE /api/v1/stockpiles/{stockpile_id}/items/{item_code}
```

Защита:

```text
stockpiles:read
stockpiles:write
```

Stockpile и StockpileItem являются clan-scoped.

---

## Timers

Endpoints:

```text
GET    /api/v1/timers
POST   /api/v1/timers
GET    /api/v1/timers/{timer_id}
PATCH  /api/v1/timers/{timer_id}
DELETE /api/v1/timers/{timer_id}
```

Защита:

```text
timers:read
timers:write
```

Timer является clan-scoped.

Поддерживается новый и legacy-формат:

```text
ends_at
target_timestamp
type
duration_seconds
```

---

## i18n

Файлы:

```text
app/core/i18n/
app/core/locales/
app/domain/*/locales/
```

Поддерживаемые языки:

```text
ru
en
cs
```

`cz` нормализуется в `cs`.

Язык определяется из:

```text
X-Locale
Accept-Language
```

Домены переводов:

```text
core
auth
catalog
production
stockpiles
timers
```

---

## Database / Supabase

Backend использует PostgreSQL через asyncpg.

Рекомендуемый Supabase URL для Render — pooler:

```env
DATABASE_URL=postgresql+asyncpg://postgres.<PROJECT_REF>:<PASSWORD>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
DB_USE_PGBOUNCER=false
```

Для transaction pooler на `6543`:

```env
DB_USE_PGBOUNCER=true
```

---

## Render Free оптимизация

Файл:

```text
app/core/db.py
```

Параметры пула:

```python
pool_size=3
max_overflow=2
pool_recycle=1800
pool_pre_ping=True
```

Дополнительно:

```text
pool_use_lifo
pool_timeout
run_with_retry
warmup
```

Health endpoints:

```text
GET /api/v1/health/live
GET /api/v1/health/ping
```

`/ping` выполняет:

```sql
SELECT 1
```

---

## Environment variables

Минимум для локального запуска:

```env
ENV=local
DATABASE_URL=postgresql+asyncpg://postgres.<PROJECT_REF>:<PASSWORD>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
DB_USE_PGBOUNCER=false

JWT_SECRET=change-me
JWT_ALG=HS256
JWT_ISSUER=sandalis
JWT_AUDIENCE=sandalis-web

API_V1_PREFIX=/api/v1
DEFAULT_LOCALE=en
SUPPORTED_LOCALES=["ru","en","cs"]
I18N_HOT_RELOAD=false

CORS_ORIGINS=["http://localhost:3000"]
FRONTEND_URL=http://localhost:3000

SESSION_COOKIE_NAME=sindaris_session
SESSION_TTL_MINUTES=30
COOKIE_SECURE=false
COOKIE_SAMESITE=lax

DISCORD_API_BASE_URL=https://discord.com/api/v10
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=http://localhost:8000/api/v1/auth/discord/callback
```

Для Render:

```env
ENV=prod
COOKIE_SECURE=true
PYTHON_VERSION=3.12.8
```

---

## Local development

```bash
cd backend
python -m venv .venv
```

Windows PowerShell without activating venv:

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Run migrations:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Run app:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Open:

```text
http://127.0.0.1:8000/api/docs
http://127.0.0.1:8000/api/v1/health/live
http://127.0.0.1:8000/api/v1/health/ping
```

---

## Tests

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

Expected:

```text
50 passed
```

Тесты покрывают:

- auth;
- catalog/items;
- legacy codes;
- orders;
- stockpiles;
- timers;
- tenancy isolation;
- RBAC;
- i18n;
- health;
- timer calculations.

---

## Alembic

Migrations live in:

```text
backend/migrations/
```

Current chain:

```text
0001_initial
0002_clan_scope_backfill
0003_domain_modules
0004_discord_oauth        # users.avatar_url
```

Apply:

```bash
python -m alembic upgrade head
```

Current revision:

```bash
python -m alembic current
```

---

## Render deploy

Recommended settings:

### Root Directory

```text
backend
```

### Build Command

```bash
python -m pip install --upgrade pip && python -m pip install -r requirements.txt
```

### Start Command

```bash
python -m alembic upgrade head && python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
```

### Health Check Path

```text
/api/v1/health/live
```

---

## Public URLs

Production:

```text
https://sandalis-web-v2-0.onrender.com/api/docs
https://sandalis-web-v2-0.onrender.com/api/v1/health/live
https://sandalis-web-v2-0.onrender.com/api/v1/health/ping
```

---

## Known breaking changes

Backend v2.0 is a new API architecture.

Potential breaking points for old frontend:

- auth flow changed: Discord OAuth (`/api/v1/auth/discord/*`) + HttpOnly session cookie, old session table removed;
- some response DTOs may differ from old backend;
- protected endpoints now require JWT or clan-token;
- clan isolation is mandatory.

Legacy compatibility preserved where practical:

- `/api/v1/codes` still behaves as item-code search alias;
- timers expose legacy fields like `type` and `target_timestamp`.

---

## Roadmap

### P0 — must-have before production

- Add Discord login button integration on frontend if needed.
- Store Discord `refresh_token` if long-lived sessions will be needed.

### P1

- Admin UI/API for clan membership management.
- Seed script for first clan/admin.
- Catalog import script for full Foxhole item database.
- Better frontend compatibility DTOs.
- Token refresh/session rotation.

### P2

- Reintroduce workers if needed:
  - war_import;
  - ffmpeg;
  - S3/media processing.
- Add background job runner separate from Render web service.
- Add cache layer for catalog search if catalog grows large.

### P3

- Observability:
  - structured logs;
  - request IDs;
  - Sentry/OpenTelemetry;
  - DB timing metrics.

---

## Discord OAuth Definition of Done (выполнено)

Все пункты закрыты и проверены на проде (/discord/login → Discord → callback):

- `GET /api/v1/auth/discord/login` redirects to Discord.
- `GET /api/v1/auth/discord/callback` validates `state`.
- Discord user profile is fetched from Discord API.
- `User` is created/updated.
- `ClanMembership` is resolved.
- JWT is issued with correct `clan_id`, role and scopes.
- Cookie mode works.
- Bearer-token mode works.
- `/api/v1/auth/me` works after Discord login.
- Invalid state returns localized error.
- Expired/unknown user returns localized error.
- Tests cover success and failure paths.
- No Discord secrets are committed.

---

## Security notes

Never commit:

```text
.env
DATABASE_URL
JWT_SECRET
DISCORD_CLIENT_SECRET
S3_SECRET_KEY
SUPABASE_SECRET_KEY
```

Check before commit:

```bash
git status --short
git diff --cached --name-only
```

`.env` must be ignored.

---

## Maintainer notes

The backend is designed to fail closed:

- missing clan context blocks clan-scoped queries;
- cross-clan mutation raises an error;
- RBAC denies missing scopes;
- health/ping is intentionally lightweight;
- global catalog remains shared to save Supabase free-tier storage.
```


---

## Production runbook (актуально на октябрь 2026. Писал в 3 ночи 11 октября)

### Состояние

- Сайт — **один** web-сервис Render на Docker (`Dockerfile` в корне репозитория):
  Next.js на публичном `$PORT` + FastAPI на `127.0.0.1:8000` в одном контейнере.
  Браузер видит только домен сервиса, `/api/v1/*` Next проксирует в FastAPI —
  CORS не нужен, кука сессии first-party, один холодный старт.
- При каждом старте контейнера (`deploy/start.sh`): `alembic upgrade head` → `python -m app.seed`
  (каталог 396 предметов, рецепты Factory/MPF/Refinery, контент) → uvicorn + next.
- Описание сервиса — `infra/render.yaml`.

### Render — сервис `Sandalis-web-v2.0` (единственный)

Сайт: `https://sandalis-web-v2-0.onrender.com`, деплой из ветки `main`.

| Поле | Значение |
|---|---|
| Language | **Docker** |
| Root Directory | пусто |
| Dockerfile Path | `./Dockerfile` |
| Docker Build Context | `.` |
| Build / Start Command | пусто (всё в `Dockerfile` и `deploy/start.sh`) |
| Health Check Path | `/api/v1/health/live` |

### Render — переменные окружения

```env
ENV=prod                      # закрывает /auth/dev-token без X-Dev-Auth-Key
DATABASE_URL=postgresql+asyncpg://postgres.<PROJECT_REF>:<PASSWORD>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
DB_USE_PGBOUNCER=false
JWT_SECRET=<длинный случайный секрет: openssl rand -hex 32>

DISCORD_CLIENT_ID=<Discord Developer Portal>
DISCORD_CLIENT_SECRET=<Discord Developer Portal>
DISCORD_REDIRECT_URI=https://sandalis-web-v2-0.onrender.com/api/v1/auth/discord/callback
FRONTEND_URL=https://sandalis-web-v2-0.onrender.com          # куда вернуть пользователя после входа

COOKIE_SECURE=true
COOKIE_SAMESITE=lax
SESSION_COOKIE_NAME=sindaris_session
SESSION_TTL_MINUTES=10080     # 7 суток
ACCESS_TOKEN_TTL_MIN=10080    # JWT живёт столько же, сколько кука

DEFAULT_CLAN_ID=SANDALIS      # основной клан: его admin+ правят глобальный контент
GUEST_ACCESS_ENABLED=true     # гость видит только инструменты, данные кланов — никогда
DEFAULT_LOCALE=ru
```

Не нужны (кодом не читаются, удалить): `ACCESS_TOKEN`, `ACCESS_TOKENS_JSON`, `DEBUG`, `REDIRECT_URI`,
`S3_*`, `CORS_ORIGINS` (браузер в API напрямую не ходит), `BACKEND_URL`, `NODE_VERSION`.

### Discord Developer Portal

OAuth2 → Redirects (точное совпадение, scopes `identify guilds`):

```text
https://sandalis-web-v2-0.onrender.com/api/v1/auth/discord/callback
http://localhost:3000/api/v1/auth/discord/callback
```

Для отправки рапортов в канал офицер (admin+) вставляет URL вебхука канала в «Кабинет» →
«Канал Discord для рапортов». Секрет хранится в БД клана и наружу не отдаётся.

### Расшифровка `?error=` после callback

| Код | Причина | Что делать |
|---|---|---|
| `forbidden` | Нет клана, нет серверов во владении и нет кланов с ботом | Командир добавляет бота и подтягивает роли в «Роли Discord» |
| `setup_expired` | Выбор сервера не сделан за 15 минут | Повторить вход |
| `state_invalid` | Просроченный/чужой state (TTL 10 мин) | Повторить вход |
| `exchange_failed` | Discord отклонил код: неверный secret или redirect_uri | Сверить `DISCORD_CLIENT_SECRET` и `DISCORD_REDIRECT_URI` с порталом |
| `disabled` | Пустые `DISCORD_CLIENT_ID`/`SECRET` | Заполнить в Environment |

### Первый вход владельца

1. Владелец Discord-сервера клана открывает сайт → «Войти через Discord».
2. Discord спрашивает доступ к списку серверов; после входа появляется «Выберите сервер клана».
3. Выбор сервера → роль «Командир клана», права «Полный доступ». Если раньше владелец уже
   был owner клана `SANDALIS`, этот клан привязывается к серверу, данные сохраняются;
   иначе создаётся клан с id = ID сервера — тогда для правки контента выставьте
   `CONTENT_ADMIN_CLAN_ID` = этот id.
4. Командир: «Кабинет» → «Роли Discord» → «Добавить бота» → «Подтянуть роли» → уровни ролей.
   Участники сервера при входе через Discord видят «Вступить в терминал клана …».

### Локальные тесты

`tests/conftest.py` жёстко задаёт `DATABASE_URL=...127.0.0.1:5433/sandalis_test` и делает `drop_all/create_all` на каждый тест — тесты никогда не ходят в Supabase. Нужен локальный PostgreSQL на 5433 (5432 на Windows часто занят WSL/другим контейнером):

```powershell
docker run --name sandalis-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sandalis_test -p 5433:5432 -d postgres:15
# в дальнейшем: docker start sandalis-pg
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

Без запущенного контейнера интеграционные тесты падают с `ConnectionRefusedError` — это ожидаемо и безопасно.

### Известные ограничения / следующие шаги

- Workers (`war_import`, `ffmpeg`, S3) в v2.0 не перенесены.
- Нет seed-скрипта первого клана: клан создаёт владелец Discord-сервера выбором сервера при входе.
- Глобальный контент (видео входа, ссылки, обучение) правится через `PUT /api/v1/content/{kind}/{key}`
  (admin+ клана `CONTENT_ADMIN_CLAN_ID`/`DEFAULT_CLAN_ID`); страницы редактирования в интерфейсе нет.