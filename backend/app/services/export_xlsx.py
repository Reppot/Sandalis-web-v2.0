from io import BytesIO

from openpyxl import Workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order


async def orders_xlsx(session: AsyncSession) -> BytesIO:
    result = await session.execute(select(Order).order_by(Order.deadline))

    wb = Workbook()
    ws = wb.active
    ws.append(["ID", "Предмет", "Кол-во", "Статус", "Дедлайн"])
    for order in result.scalars():
        ws.append([order.id, order.item_id, order.quantity, order.status, order.deadline])

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf  # эндпоинт отдаёт buf как attachment
