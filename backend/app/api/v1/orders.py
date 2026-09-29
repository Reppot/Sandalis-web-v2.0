from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.schemas.order import OrderCreate, OrderOut
from app.services import order_service

router = APIRouter()


@router.get("", response_model=list[OrderOut])
async def list_open(session: AsyncSession = Depends(get_session)):
    return await order_service.list_open(session)


@router.post("", response_model=OrderOut, status_code=201)
async def create(data: OrderCreate, session: AsyncSession = Depends(get_session)):
    return await order_service.create_order(session, data)
