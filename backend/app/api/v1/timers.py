from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.services import timer_service

router = APIRouter()


@router.get("")
async def list_active(session: AsyncSession = Depends(get_session)):
    # актуальные дедлайны приходят из таблицы timers,
    # а не пересчитываются каждым браузером
    return await timer_service.list_active(session)
