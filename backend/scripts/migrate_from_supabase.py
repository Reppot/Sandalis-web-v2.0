"""Миграция данных из старой Supabase в новый PostgreSQL 16.

Использование:
    export SOURCE_DB_URL="postgresql+asyncpg://user:pass@supabase-host:6543/postgres"
    export DATABASE_URL="postgresql+asyncpg://sandalis:sandalis@localhost:5432/sandalis"
    python -m scripts.migrate_from_supabase

Скрипт идемпотентен: при повторном запуске пропускает уже существующие записи.
"""
import asyncio
import logging
import os
import sys
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import async_session_factory
from app.models import Order, OrderItem, Session, Stockpile, StockpileItem, Timer, User

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("migrate")


async def migrate_users(source_session, target_session) -> int:
    """Переносит пользователей."""
    result = await source_session.execute(text("SELECT id, discord_id, username, avatar_url, role, created_at, updated_at FROM users"))
    rows = result.mappings().all()

    migrated = 0
    for row in rows:
        exists = await target_session.execute(
            select(User).where(User.discord_id == row["discord_id"])
        )
        if exists.scalar_one_or_none() is not None:
            continue

        user = User(
            id=str(row["id"]),
            discord_id=row["discord_id"],
            username=row["username"] or "unknown",
            avatar_url=row.get("avatar_url"),
            role=row.get("role", "member"),
            created_at=row["created_at"] or datetime.now(timezone.utc),
            updated_at=row["updated_at"] or datetime.now(timezone.utc),
        )
        target_session.add(user)
        migrated += 1

    await target_session.flush()
    logger.info("Users migrated: %d", migrated)
    return migrated


async def migrate_sessions(source_session, target_session) -> int:
    """Переносит активные сессии."""
    result = await source_session.execute(
        text("SELECT id, session_token, user_id, role, expires_at, created_at, updated_at FROM sessions WHERE expires_at > NOW()")
    )
    rows = result.mappings().all()

    migrated = 0
    for row in rows:
        exists = await target_session.execute(
            select(Session).where(Session.session_token == row["session_token"])
        )
        if exists.scalar_one_or_none() is not None:
            continue

        session = Session(
            id=str(row["id"]),
            session_token=row["session_token"],
            user_id=str(row["user_id"]) if row["user_id"] else None,
            role=row.get("role", "member"),
            expires_at=row["expires_at"],
            created_at=row["created_at"] or datetime.now(timezone.utc),
            updated_at=row["updated_at"] or datetime.now(timezone.utc),
        )
        target_session.add(session)
        migrated += 1

    await target_session.flush()
    logger.info("Sessions migrated: %d", migrated)
    return migrated


async def migrate_orders(source_session, target_session) -> int:
    """Переносит заказы и их позиции."""
    result = await source_session.execute(
        text("SELECT id, creator_id, assignee_id, status, destination, notes, created_at, updated_at FROM orders")
    )
    orders = result.mappings().all()

    migrated = 0
    for row in orders:
        exists = await target_session.execute(select(Order).where(Order.id == str(row["id"])))
        if exists.scalar_one_or_none() is not None:
            continue

        # Получаем позиции заказа
        items_result = await source_session.execute(
            text("SELECT item_id, quantity, completed_quantity FROM order_items WHERE order_id = :oid"),
            {"oid": row["id"]},
        )
        items = items_result.mappings().all()

        order = Order(
            id=str(row["id"]),
            creator_id=row.get("creator_id"),
            assignee_id=row.get("assignee_id"),
            status=row.get("status", "pending"),
            destination=row["destination"],
            notes=row.get("notes"),
            created_at=row["created_at"] or datetime.now(timezone.utc),
            updated_at=row["updated_at"] or datetime.now(timezone.utc),
            items=[
                OrderItem(
                    item_id=it["item_id"],
                    quantity=it["quantity"],
                    completed_quantity=it.get("completed_quantity", 0),
                )
                for it in items
            ],
        )
        target_session.add(order)
        migrated += 1

    await target_session.flush()
    logger.info("Orders migrated: %d", migrated)
    return migrated


async def migrate_stockpiles(source_session, target_session) -> int:
    """Переносит склады и их содержимое."""
    result = await source_session.execute(
        text("SELECT id, name, location, code, last_updated_by, created_at, updated_at FROM stockpiles")
    )
    stockpiles = result.mappings().all()

    migrated = 0
    for row in stockpiles:
        exists = await target_session.execute(select(Stockpile).where(Stockpile.id == str(row["id"])))
        if exists.scalar_one_or_none() is not None:
            continue

        items_result = await source_session.execute(
            text("SELECT item_id, quantity FROM stockpile_items WHERE stockpile_id = :sid"),
            {"sid": row["id"]},
        )
        items = items_result.mappings().all()

        stockpile = Stockpile(
            id=str(row["id"]),
            name=row["name"],
            location=row["location"],
            code=row.get("code"),
            last_updated_by=row.get("last_updated_by"),
            created_at=row["created_at"] or datetime.now(timezone.utc),
            updated_at=row["updated_at"] or datetime.now(timezone.utc),
            items=[StockpileItem(item_id=it["item_id"], quantity=it["quantity"]) for it in items],
        )
        target_session.add(stockpile)
        migrated += 1

    await target_session.flush()
    logger.info("Stockpiles migrated: %d", migrated)
    return migrated


async def migrate_timers(source_session, target_session) -> int:
    """Переносит таймеры складов."""
    result = await source_session.execute(
        text("SELECT id, name, type, target_timestamp, duration_seconds, created_by, created_at, updated_at FROM timers")
    )
    rows = result.mappings().all()

    migrated = 0
    for row in rows:
        exists = await target_session.execute(select(Timer).where(Timer.id == str(row["id"])))
        if exists.scalar_one_or_none() is not None:
            continue

        timer = Timer(
            id=str(row["id"]),
            name=row["name"],
            type=row.get("type", "stockpile_decay"),
            target_timestamp=int(row["target_timestamp"]),
            duration_seconds=int(row.get("duration_seconds", 172800)),
            created_by=row.get("created_by"),
            created_at=row["created_at"] or datetime.now(timezone.utc),
            updated_at=row["updated_at"] or datetime.now(timezone.utc),
        )
        target_session.add(timer)
        migrated += 1

    await target_session.flush()
    logger.info("Timers migrated: %d", migrated)
    return migrated


async def run_migration() -> None:
    source_url = os.environ.get("SOURCE_DB_URL")
    if not source_url:
        logger.error("SOURCE_DB_URL environment variable is required")
        sys.exit(1)

    source_engine = create_async_engine(source_url, echo=False)
    source_factory = async_sessionmaker(source_engine, expire_on_commit=False)

    logger.info("Starting Supabase → PostgreSQL 16 migration")

    async with source_factory() as source_session, async_session_factory() as target_session:
        try:
            users_count = await migrate_users(source_session, target_session)
            sessions_count = await migrate_sessions(source_session, target_session)
            orders_count = await migrate_orders(source_session, target_session)
            stockpiles_count = await migrate_stockpiles(source_session, target_session)
            timers_count = await migrate_timers(source_session, target_session)

            await target_session.commit()

            logger.info("=" * 60)
            logger.info("Migration complete:")
            logger.info("  Users:      %d", users_count)
            logger.info("  Sessions:   %d", sessions_count)
            logger.info("  Orders:     %d", orders_count)
            logger.info("  Stockpiles: %d", stockpiles_count)
            logger.info("  Timers:     %d", timers_count)
            logger.info("=" * 60)
        except Exception as e:
            await target_session.rollback()
            logger.exception("Migration failed: %s", e)
            raise
        finally:
            await source_engine.dispose()


def main() -> None:
    asyncio.run(run_migration())


if __name__ == "__main__":
    main()