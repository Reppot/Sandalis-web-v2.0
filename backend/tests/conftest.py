from __future__ import annotations

import asyncio
import os
import uuid

# --- env ДО любых импортов app.* -------------------------------------------- #
os.environ["DATABASE_URL"] = (
    "postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/sandalis_test"
)
os.environ["JWT_SECRET"] = "test-secret-only-for-ci-do-not-use-in-prod"
os.environ["ENV"] = "local"
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


async def seed_catalog_item(code: str = "rifle", category: str = "small_arms") -> None:
    async with AsyncSessionLocal() as s:
        s.add(CatalogItem(code=code, category=category))
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
