from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from sqlalchemy.engine.url import URL, make_url
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import AsyncAdaptedQueuePool, NullPool

from app.core.config import settings
import app.core.tenancy  # noqa: F401  ← регистрирует ORM-события изоляции клана

logger = logging.getLogger(__name__)

RETRYABLE = (OperationalError, InterfaceError, ConnectionResetError, OSError)


def _normalize_url(raw: str) -> URL:
    """
    Чистим URL под asyncpg:
      * psycopg-шный `sslmode=require` asyncpg не понимает -> выбрасываем
        (SSL к Supabase поднимается через connect_args["ssl"]);
      * при pgbouncer выключаем dialect-level кэш prepared statements.
    """
    url = make_url(raw)
    if url.drivername.startswith("postgresql") and "+" not in url.drivername:
        url = url.set(drivername="postgresql+asyncpg")

    query = dict(url.query)
    query.pop("sslmode", None)
    query.pop("channel_binding", None)
    if settings.DB_USE_PGBOUNCER:
        query["prepared_statement_cache_size"] = "0"
    return url.set(query=query)


def _connect_args(url: URL) -> dict[str, Any]:
    args: dict[str, Any] = {
        "timeout": settings.DB_CONNECT_TIMEOUT,     # TCP+handshake
        "command_timeout": settings.DB_COMMAND_TIMEOUT,
        "server_settings": {
            "application_name": f"sandalis-api-{settings.ENV}",
            "jit": "off",            # на free-tier JIT только жрёт CPU/RAM
            "timezone": "UTC",
        },
    }
    host = url.host or ""
    if "supabase" in host or settings.ENV != "local":
        args["ssl"] = "require"

    if settings.DB_USE_PGBOUNCER:
        # transaction pooling несовместим с prepared statements asyncpg
        args["statement_cache_size"] = 0
        args["prepared_statement_name_func"] = lambda: f"__asyncpg_{uuid4().hex}__"
    return args


def _build_engine() -> AsyncEngine:
    url = _normalize_url(settings.DATABASE_URL)

    if settings.DB_USE_PGBOUNCER:
        # За pgbouncer собственный пул приложения вреден -> NullPool.
        pool_kwargs: dict[str, Any] = {"poolclass": NullPool}
    else:
        pool_kwargs = {
            "poolclass": AsyncAdaptedQueuePool,
            "pool_size": settings.DB_POOL_SIZE,          # 3
            "max_overflow": settings.DB_MAX_OVERFLOW,    # 2  -> жёсткий потолок 5 коннектов
            "pool_timeout": settings.DB_POOL_TIMEOUT,    # ждать коннект максимум 10 c
            "pool_recycle": settings.DB_POOL_RECYCLE,    # 1800 c < idle-таймаута Supabase
            "pool_pre_ping": True,                       # ← ключ к «просыпанию» Render
            "pool_use_lifo": True,                       # LIFO: «хвост» пула тихо отмирает
        }

    return create_async_engine(
        url,
        echo=settings.SQL_ECHO,
        future=True,
        pool_reset_on_return="rollback",
        connect_args=_connect_args(url),
        **pool_kwargs,
    )


engine: AsyncEngine = _build_engine()

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,   # объекты остаются валидными после commit -> нет лишних SELECT
    autoflush=False,
)


async def get_session() -> AsyncIterator[AsyncSession]:
    """Базовая сессия БЕЗ клановой привязки (auth, health, глобальные справочники)."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def run_with_retry(coro_factory, attempts: int = 3, base_delay: float = 0.25):
    """
    Render free-tier: после «сна» первый запрос ловит ConnectionResetError /
    'connection was closed in the middle of operation' ДО того, как pre_ping
    успеет инвалидировать весь пул. Один ретрай решает 99% таких 500-ок.
    """
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            return await coro_factory()
        except RETRYABLE as exc:  # noqa: PERF203
            invalidated = getattr(exc, "connection_invalidated", True)
            if not invalidated and not isinstance(exc, (ConnectionResetError, OSError)):
                raise
            last = exc
            logger.warning("DB retry %s/%s: %s", attempt + 1, attempts, exc)
            await asyncio.sleep(base_delay * (2**attempt))
        except DBAPIError as exc:
            if not exc.connection_invalidated:
                raise
            last = exc
            await asyncio.sleep(base_delay * (2**attempt))
    raise last  # type: ignore[misc]


async def warmup() -> None:
    """lifespan-startup: держим 1 живой коннект, чтобы первый юзер не ждал TLS-handshake."""
    from sqlalchemy import text

    async def _ping():
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))

    try:
        await run_with_retry(_ping, attempts=2)
    except Exception as exc:  # не валим старт приложения из-за спящей БД
        logger.warning("DB warmup failed: %s", exc)


async def dispose_engine() -> None:
    await engine.dispose()
