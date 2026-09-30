from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db

router = APIRouter(tags=["health"])


@router.get("/api/health")
async def api_health(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Healthcheck для render.com — проверяет связь с PostgreSQL."""
    await db.execute(text("SELECT 1"))
    return {"status": "ok", "service": "sandalis-api"}


@router.get("/health")
async def root_health() -> dict[str, str]:
    """Простой health без БД — для балансировщика."""
    return {"status": "ok"}