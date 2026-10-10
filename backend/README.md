# Sandalis Web v2.0 — Backend (FastAPI)

Асинхронный бэкенд с тремя сквозными системами: **мультиарендность кланов**
(Discriminator Column, Shared DB / Shared Schema), **RBAC внутри клана** и
**модульная i18n** (RU/EN/CS). Заточен под бесплатные тарифы Render + Supabase
(пул ≤ 5 коннектов, pre_ping против «спящего» режима, словари в JSON, а не в БД).

## Быстрый старт

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # прописать DATABASE_URL и JWT_SECRET

alembic upgrade head            # схема БД
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

- Swagger UI: http://127.0.0.1:8000/api/docs
- Health для Render: `GET /api/v1/health/live` (без БД)
- Keep-alive ping для cron-job.org (раз в 10 мин): `GET /api/v1/health/ping` (`SELECT 1`)
- Тесты (нужен локальный PostgreSQL, БД `sandalis_test`): `pytest`

## Аутентификация запроса (любой из трёх способов)

| Способ | Заголовок/кука | Кем выдаётся |
|---|---|---|
| JWT сессии | `Authorization: Bearer <jwt>` | OAuth-flow (Discord) |
| JWT сессии | кука `sandalis_session` | тот же OAuth-flow |
| Клановый токен | `X-Clan-Token: <raw>` | админ клана (бот, shared-ссылки) |

JWT уже несёт `clan_id` + `role` (+ дельты скоупов `xsc`/`rsc`).
`locale` для ответов: `X-Locale` (приоритетно) или `Accept-Language` с q-факторами
(`cz` → `cs`).

## Как это устроено

- **Изоляция кланов — `app/core/tenancy.py`.**
  `do_orm_execute` инъектит `with_loader_criteria(ClanScopedMixin, clan_id == …)`
  в КАЖДЫЙ select/update/delete, который затрагивает арендованные таблицы;
  `before_flush` автоподставляет `clan_id` при INSERT и бросает
  `ClanScopeViolationError` при попытке записи/переноса в чужой клан.
  Без контекста — fail-closed (`ClanContextMissingError`).
  Источник истины контекста — `session.info["clan_id"]` (ставится в
  `api/deps.get_principal`), ContextVar — резервный канал для фоновых задач
  (`clan_scope(...)` для APScheduler/CLI). Единственный осознанный «люк» —
  `bypass_clan_filter()` для auth по clan-token, миграций и суперадмина.
  ⚠️ `session.get(Model, pk)` обходит фильтр через identity map — запрещён,
  вместо него `ClanScopedService._get_scoped()`.
- **RBAC — `app/core/permissions.py` + `app/api/deps.PermissionChecker`.**
  Матрица `ClanRole → scopes` с wildcard (`owner: *`, `orders:*`) и точечными
  грантами/отзывами из `clan_memberships`. На роутере:
  `dependencies=[Depends(PermissionChecker([Scopes.ORDERS_WRITE]))]`.
- **i18n — `app/core/i18n/`.** Словари лежат рядом с доменом:
  `app/domain/<domain>/locales/{ru,en,cs}.json` + общий `app/core/locales/`.
  Папка подхватывается автоматически (`load_catalogs()`), монолитного файла нет.
  Плюрализация ru/cs по CLDR-формам (`key.one/few/many/other`).
  Ошибки API — всегда конверт `{error: {code, message, locale, params}}` +
  заголовок `Content-Language`; доменные исключения несут **ключ**, а не текст.
- **Render/Supabase — `app/core/db.py`.** `pool_size=3, max_overflow=2,
  pool_recycle=1800, pool_pre_ping=True, pool_use_lifo=True`, повтор запроса при
  обрыве после сна (`run_with_retry`), `warmup()` в lifespan. Для Supabase
  Pooler (:6543) — `DB_USE_PGBOUNCER=true` (NullPool + отключение кэша prepared
  statements). `sslmode=require` из URL вырезается, SSL поднимается через
  `connect_args`.

## Экономия лимита 500 МБ

Один `clan_id String(64)` вместо схем/БД на арендатора; глобальный справочник
`catalog_items` не дублируется; составные индексы `(clan_id, …)` вместо двух
одиночных; переводы — JSON в репозитории, а не таблицы; FK `clan_id → clans.id`
гарантирует целостность и каскадное удаление аренды.

## Структура

```
app/
├── core/        config, db, tenancy, security, permissions, errors, i18n/, locales/
├── domain/      <domain>/locales/*.json   (production, catalog)
├── models/      base (Base+миксины), rbac, catalog, order, stockpile
├── schemas/     Pydantic v2 (Page, Create/Update/Read)
├── services/    ClanScopedService, OrderService
├── api/         deps.py (Principal/RBAC/Translator), v1/ (health, orders)
└── main.py      lifespan (i18n + warmup), locale-middleware, handlers
```

## Заметки, полученные сборкой в песочнице (отличия от первоначального ТЗ)

1. `Enum` в PG должен хранить **значения**, не имена: `values_callable` в
   `SAEnum(...)`, иначе INSERT падает `invalid input value for enum`, а DDL
   `create_all` дрейфует от миграций.
2. `clan_scope()`/`bypass_clan_filter()` — синхронные менеджеры: их нельзя
   перечислять через запятую в `async with`; `commit()` фоновой задачи держим
   ВНУТРИ области (в HTTP-слое это обеспечивает `session.info`).
3. `clan_id` — FK на `clans.id` и в модели, и в миграциях: клан должен
   существовать до первой записи его данных (рега клана — при Discord OAuth).
4. Дальше по дорожной карте: `ClanMembershipService` + выдача JWT после OAuth;
   Postgres RLS (`SET LOCAL app.clan_id`) как 4-й рубеж; TTL-джоба очистки
   завершённых заказов старше 90 дней.
