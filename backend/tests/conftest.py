from __future__ import annotations

import asyncio
import os
import uuid
from pathlib import Path
from urllib.parse import unquote, urlsplit

# --- env ДО любых импортов app.* -------------------------------------------- #
test_database_url = os.environ.get("TEST_DATABASE_URL", "").strip()
if not test_database_url:
    raise RuntimeError(
        "Set TEST_DATABASE_URL to a dedicated local PostgreSQL database before running tests. "
        "Tests refuse to fall back to DATABASE_URL because their fixture drops all tables."
    )

def _database_target(url: str) -> tuple[str | None, int | None, str]:
    parsed = urlsplit(url)
    if parsed.scheme not in {"postgres", "postgresql", "postgresql+asyncpg"}:
        raise RuntimeError("TEST_DATABASE_URL must use PostgreSQL with asyncpg.")
    return parsed.hostname, parsed.port, unquote(parsed.path.lstrip("/"))


test_host, _, test_name = _database_target(test_database_url)
if test_host not in {"localhost", "127.0.0.1", "::1", "db", "postgres"}:
    raise RuntimeError("TEST_DATABASE_URL must point to localhost or a local CI PostgreSQL service.")
if not (test_name.lower().endswith("_test") or test_name.lower().startswith("test_")):
    raise RuntimeError("TEST_DATABASE_URL database name must end in '_test' or start with 'test_'.")

runtime_database_url = os.environ.get("DATABASE_URL", "").strip()
runtime_env = Path(__file__).resolve().parents[1] / ".env"
already_configured_test_target = os.environ.get("SANDALIS_TEST_DATABASE_TARGET") == test_database_url
if not runtime_database_url and not already_configured_test_target and runtime_env.is_file():
    for line in runtime_env.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("DATABASE_URL="):
            runtime_database_url = line.split("=", 1)[1].strip().strip("\"'")
            break
if not already_configured_test_target and runtime_database_url and _database_target(runtime_database_url) == _database_target(test_database_url):
    raise RuntimeError("TEST_DATABASE_URL matches the application's DATABASE_URL; refusing destructive tests.")

os.environ["DATABASE_URL"] = test_database_url
os.environ["SANDALIS_TEST_DATABASE_TARGET"] = test_database_url
os.environ["JWT_SECRET"] = "test-secret-only-for-ci-do-not-use-in-prod"
os.environ["ENV"] = "local"
# The project .env is loaded by Pydantic even when tests run, so pin its
# runtime-facing values here. In particular, a developer's Discord OAuth
# credentials must not silently turn the "disabled by default" tests on.
os.environ["DISCORD_CLIENT_ID"] = ""
os.environ["DISCORD_CLIENT_SECRET"] = ""
os.environ["DISCORD_REDIRECT_URI"] = ""
os.environ["FRONTEND_URL"] = "http://localhost:3000"
os.environ["COOKIE_SECURE"] = "false"
os.environ["COOKIE_SAMESITE"] = "lax"
os.environ["SESSION_COOKIE_NAME"] = "sandalis_session"
os.environ["SESSION_TTL_MINUTES"] = "60"
# Most API tests intentionally use isolated signed principals instead of creating
# a membership row for each fixture. Dedicated auth tests enable live membership
# checks to verify production behavior.
os.environ["AUTH_MEMBERSHIP_CHECK"] = "false"
# NullPool: коннекты открываются/закрываются внутри одного event loop —
# тесты опираются на asyncio.run() с чистым loop на каждый кейс.
os.environ["DB_USE_PGBOUNCER"] = "true"

import pytest

import app.models  # noqa: F401 — регистрируем все таблицы на metadata
from app.core.db import AsyncSessionLocal, engine
from app.core.permissions import ClanRole
from app.core.security import hash_clan_token, issue_access_token
from app.core.tenancy import bypass_clan_filter, clan_scope
from app.models.base import Base
from app.models.catalog import CatalogItem
from app.models.rbac import Clan, ClanApiToken
from app.models.stockpile import Stockpile, StockpileItem


def run(coro):
    """Выполнить корутину в чистом event loop (один loop на тест)."""
    return asyncio.run(coro)


@pytest.fixture()
def db():
    """Полностью чистая схема на каждый тест (локальный PostgreSQL)."""
    # Очистка таблиц должна сбрасывать и process-local кеши, иначе данные
    # предыдущего теста могут пережить БД и повлиять на следующий.
    from app.services.blacklist import clear_cache

    clear_cache()

    async def _reset() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        await engine.dispose()

    run(_reset())
    yield


# --------------------------------------------------------------------------- #
# Хелперы
# --------------------------------------------------------------------------- #
def bearer(
    *,
    user_id: str = "user-1",
    clan_id: str = "CLAN_A",
    role: ClanRole = ClanRole.ADMIN,
) -> dict[str, str]:
    token = issue_access_token(user_id=user_id, clan_id=clan_id, role=role)
    return {"Authorization": f"Bearer {token}"}


async def seed_clan(clan_id: str = "CLAN_A", name: str = "Alpha") -> None:
    # Clan — глобальная таблица, контекст клана не нужен. Необходим, т.к.
    # clan_id всех арендованных таблиц ссылается на clans.id (FK целостность).
    async with AsyncSessionLocal() as s:
        s.add(Clan(id=clan_id, name=name))
        await s.commit()


async def seed_catalog_item(
    code: str = "rifle",
    category: str = "small_arms",
    name: str = "",
    english_name: str = "",
    is_active: bool = True,
) -> None:
    async with AsyncSessionLocal() as s:
        s.add(CatalogItem(
            code=code, category=category,
            name=name or code, english_name=english_name or code,
            is_active=is_active,
        ))
        await s.commit()


async def seed_stockpile_with_stock(
    quantity: int = 5, clan_id: str = "CLAN_A", item_code: str = "rifle"
) -> uuid.UUID:
    await seed_clan(clan_id)
    async with AsyncSessionLocal() as s:
        with clan_scope(clan_id):
            sp = Stockpile(name="Main", region="Deadlands")
            s.add(sp)
            await s.flush()
            s.add(StockpileItem(stockpile_id=sp.id, item_code=item_code, quantity=quantity))
            await s.commit()
            return sp.id


async def seed_clan_token(
    raw_token: str,
    *,
    clan_id: str = "CLAN_A",
    role: ClanRole = ClanRole.GUEST,
) -> None:
    async with AsyncSessionLocal() as s:
        with bypass_clan_filter():
            s.add(Clan(id=clan_id, name="Alpha"))
            s.add(
                ClanApiToken(
                    label="bot", token_hash=hash_clan_token(raw_token),
                    role=role, clan_id=clan_id,
                )
            )
            await s.commit()
