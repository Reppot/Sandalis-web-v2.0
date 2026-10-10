from __future__ import annotations

import time
from typing import Literal

from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlalchemy import text

from app.core.config import settings
from app.core.db import engine, run_with_retry

router = APIRouter(prefix="/health", tags=["health"])


class PingOut(BaseModel):
    status: Literal["ok", "degraded"]
    db: bool
    latency_ms: float
    env: str


@router.get("/live", summary="Liveness без БД (для Render health check)")
async def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get(
    "/ping",
    response_model=PingOut,
    summary="Keep-alive: минимальный SELECT 1 (cron-job.org каждые 10 минут)",
)
async def ping(response: Response) -> PingOut:
    started = time.perf_counter()

    async def _select_one() -> None:
        # engine.connect(), а не ORM-сессия: ноль оверхеда identity map / events
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))

    db_ok = True
    try:
        await run_with_retry(_select_one, attempts=2, base_delay=0.2)
    except Exception:  # noqa: BLE001 — health не должен падать 500
        db_ok = False
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return PingOut(
        status="ok" if db_ok else "degraded",
        db=db_ok,
        latency_ms=round((time.perf_counter() - started) * 1000, 2),
        env=settings.ENV,
    )
