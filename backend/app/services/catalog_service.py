from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.catalog.recipes import materials_for  # чистая логика
from app.models.item import Item


async def list_items(session: AsyncSession) -> list[Item]:
    result = await session.execute(select(Item).order_by(Item.name))
    return list(result.scalars())


async def recipe_tree(session: AsyncSession, code: str, qty: int) -> dict[str, int]:
    # бывший calcChain из factory-data.ts — теперь чистая функция domain
    await session.scalar(select(Item.id).where(Item.code == code))
    return materials_for(code, qty)
