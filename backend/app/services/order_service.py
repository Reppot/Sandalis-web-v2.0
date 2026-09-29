# app/services/order_service.py — бизнес-операции.
# Роутер знает только про HTTP; всё остальное живёт здесь.
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.timing import calc_deadline  # чистая функция, без БД
from app.models.order import Order
from app.schemas.order import OrderCreate


async def create_order(session: AsyncSession, data: OrderCreate) -> Order:
    order = Order(
        item_id=data.item_id,
        quantity=data.quantity,
        deadline=calc_deadline(data.item_id, data.quantity),
        status="new",
    )
    session.add(order)
    await session.commit()
    await session.refresh(order)
    return order


async def list_open(session: AsyncSession) -> list[Order]:
    result = await session.execute(
        select(Order).where(Order.status != "done").order_by(Order.deadline)
    )
    return list(result.scalars())
