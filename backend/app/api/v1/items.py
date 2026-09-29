from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.schemas.item import ItemOut
from app.services import catalog_service

router = APIRouter()


@router.get("", response_model=list[ItemOut])
async def list_items(session: AsyncSession = Depends(get_session)):
    # никаких item-catalog.ts / itemCodes.ts: только select из PostgreSQL
    return await catalog_service.list_items(session)
