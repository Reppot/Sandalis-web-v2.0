from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.services import stockpile_service

router = APIRouter()


@router.get("")
async def list_stockpiles(session: AsyncSession = Depends(get_session)):
    return await stockpile_service.list_all(session)


@router.post("/{stockpile_id}/scan", status_code=202)
async def accept_scan(
    stockpile_id: int,
    payload: dict,  # снимок содержимого от парсера (ex-lib/parsers.ts)
    session: AsyncSession = Depends(get_session),
):
    return await stockpile_service.apply_scan(session, stockpile_id, payload)
