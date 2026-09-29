from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.code import Code

router = APIRouter()


@router.get("")
async def list_active(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Code).where(Code.expired.is_(False)).order_by(Code.id.desc())
    )
    return list(result.scalars())
