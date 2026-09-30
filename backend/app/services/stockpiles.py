from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import Principal
from app.models.stockpile import Stockpile, StockpileItem
from app.schemas.stockpiles import (
    CreateStockpileRequest,
    UpdateStockpileItemsRequest,
)
from app.services.errors import EntityNotFoundError


class StockpileService:
    async def list_all(
        self,
        db: AsyncSession,
        principal: Principal,
    ) -> list[Stockpile]:
        result = await db.execute(
            select(Stockpile)
            .options(selectinload(Stockpile.items))
            .order_by(Stockpile.created_at.desc())
        )

        return list(result.scalars().all())

    async def create(
        self,
        db: AsyncSession,
        principal: Principal,
        payload: CreateStockpileRequest,
    ) -> Stockpile:
        stockpile = Stockpile(
            name=payload.name,
            location=payload.location,
            code=payload.code,
            last_updated_by=principal.actor_id,
            items=[
                StockpileItem(
                    item_id=item.item_id,
                    quantity=item.quantity,
                )
                for item in payload.items
            ],
        )

        db.add(stockpile)
        await db.flush()

        return await self._get_by_id(db, stockpile.id)

    async def update_items(
        self,
        db: AsyncSession,
        principal: Principal,
        stockpile_id: str,
        payload: UpdateStockpileItemsRequest,
    ) -> Stockpile:
        stockpile = await self._get_by_id(db, stockpile_id)

        stockpile.items.clear()
        stockpile.items.extend(
            StockpileItem(
                item_id=item.item_id,
                quantity=item.quantity,
            )
            for item in payload.items
        )
        stockpile.last_updated_by = principal.actor_id

        await db.flush()

        return await self._get_by_id(db, stockpile_id)

    async def delete(
        self,
        db: AsyncSession,
        principal: Principal,
        stockpile_id: str,
    ) -> None:
        stockpile = await self._get_by_id(db, stockpile_id)

        await db.delete(stockpile)
        await db.flush()

    async def _get_by_id(
        self,
        db: AsyncSession,
        stockpile_id: str,
    ) -> Stockpile:
        result = await db.execute(
            select(Stockpile)
            .options(selectinload(Stockpile.items))
            .where(Stockpile.id == stockpile_id)
        )

        stockpile = result.scalar_one_or_none()

        if stockpile is None:
            raise EntityNotFoundError("Stockpile not found")

        return stockpile


stockpile_service = StockpileService()