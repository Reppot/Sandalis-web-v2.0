from __future__ import annotations

import uuid
from typing import Sequence

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError, NotFoundError
from app.models.catalog import CatalogItem
from app.models.stockpile import Stockpile, StockpileItem
from app.schemas.stockpile import (
    StockpileCreate,
    StockpileItemPatch,
    StockpileItemUpsert,
    StockpileUpdate,
)
from app.services.base import ClanScopedService

DOMAIN = "stockpiles"


class StockpileService(ClanScopedService):
    """CRUD складов и позиций. Вся фильтрация — через _scoped/_get_scoped
    плюс глобальный with_loader_criteria: чужой склад недоступен ни на
    чтение, ни на запись (404, а не 403 — не палим существование)."""

    # ---------------- stockpiles -------------------------------------------- #
    async def list_stockpiles(
        self, *, limit: int = 50, offset: int = 0
    ) -> tuple[Sequence[Stockpile], int, dict[uuid.UUID, tuple[int, int]]]:
        stmt = self._scoped(select(Stockpile), Stockpile)
        total = await self._count(stmt)
        rows = (
            await self.session.execute(
                stmt.order_by(Stockpile.name).limit(min(limit, 200)).offset(offset)
            )
        ).scalars().all()
        return rows, total, await self._aggregates([r.id for r in rows])

    async def _aggregates(
        self, stockpile_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, tuple[int, int]]:
        if not stockpile_ids:
            return {}
        stmt = (
            self._scoped(
                select(
                    StockpileItem.stockpile_id,
                    func.count().label("items_count"),
                    func.coalesce(func.sum(StockpileItem.quantity), 0).label("total"),
                ),
                StockpileItem,
            )
            .where(StockpileItem.stockpile_id.in_(stockpile_ids))
            .group_by(StockpileItem.stockpile_id)
        )
        return {
            row.stockpile_id: (row.items_count, int(row.total))
            for row in (await self.session.execute(stmt)).all()
        }

    async def create_stockpile(self, payload: StockpileCreate) -> tuple[Stockpile, str]:
        stockpile = Stockpile(name=payload.name, region=payload.region)
        self.session.add(stockpile)
        try:
            await self.session.commit()
        except IntegrityError as exc:  # uq (clan_id, name)
            await self.session.rollback()
            raise ConflictError(
                message_key="stockpile.name_taken", domain=DOMAIN,
                params={"name": payload.name},
            ) from exc
        await self.session.refresh(stockpile)
        return stockpile, self.t.t("stockpile.created", domain=DOMAIN, name=stockpile.name)

    async def get_stockpile(self, stockpile_id: uuid.UUID) -> Stockpile:
        return await self._get_scoped(
            Stockpile, stockpile_id,
            not_found_key="stockpile.not_found", domain=DOMAIN,
        )

    async def get_detail(
        self, stockpile_id: uuid.UUID
    ) -> tuple[Stockpile, Sequence[StockpileItem]]:
        stockpile = await self.get_stockpile(stockpile_id)
        items = (
            await self.session.execute(
                self._scoped(select(StockpileItem), StockpileItem)
                .where(StockpileItem.stockpile_id == stockpile.id)
                .order_by(StockpileItem.item_code)
            )
        ).scalars().all()
        return stockpile, items

    async def update_stockpile(
        self, stockpile_id: uuid.UUID, payload: StockpileUpdate
    ) -> tuple[Stockpile, str]:
        stockpile = await self._get_scoped(
            Stockpile, stockpile_id,
            not_found_key="stockpile.not_found", domain=DOMAIN, for_update=True,
        )
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(stockpile, field, value)
        try:
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            raise ConflictError(
                message_key="stockpile.name_taken", domain=DOMAIN,
                params={"name": payload.name or stockpile.name},
            ) from exc
        await self.session.refresh(stockpile)
        return stockpile, self.t.t("stockpile.updated", domain=DOMAIN, name=stockpile.name)

    async def delete_stockpile(self, stockpile_id: uuid.UUID) -> None:
        stockpile = await self._get_scoped(
            Stockpile, stockpile_id,
            not_found_key="stockpile.not_found", domain=DOMAIN,
        )
        await self.session.delete(stockpile)   # FK cascade снесёт позиции
        await self.session.commit()

    # ---------------- items -------------------------------------------------- #
    async def _assert_catalog_item(self, item_code: str) -> None:
        exists = (
            await self.session.execute(
                select(CatalogItem.code).where(
                    CatalogItem.code == item_code, CatalogItem.is_active.is_(True)
                )
            )
        ).scalar_one_or_none()
        if exists is None:
            raise NotFoundError(
                message_key="item.unknown_code", domain="catalog",
                params={"code": item_code},
            )

    async def _get_item_row(
        self, stockpile_id: uuid.UUID, item_code: str, *, for_update: bool = False
    ) -> StockpileItem:
        stmt = self._scoped(select(StockpileItem), StockpileItem).where(
            StockpileItem.stockpile_id == stockpile_id,
            StockpileItem.item_code == item_code,
        )
        if for_update:
            stmt = stmt.with_for_update()
        row = (await self.session.execute(stmt)).scalar_one_or_none()
        if row is None:
            raise NotFoundError(
                message_key="item.not_found", domain=DOMAIN, params={"item": item_code}
            )
        return row

    async def upsert_item(
        self, stockpile_id: uuid.UUID, payload: StockpileItemUpsert
    ) -> tuple[StockpileItem, str]:
        stockpile = await self.get_stockpile(stockpile_id)          # 404 чужой клан
        await self._assert_catalog_item(payload.item_code)

        stmt = self._scoped(select(StockpileItem), StockpileItem).where(
            StockpileItem.stockpile_id == stockpile.id,
            StockpileItem.item_code == payload.item_code,
        )
        row = (await self.session.execute(stmt)).scalar_one_or_none()
        if row is None:
            row = StockpileItem(
                stockpile_id=stockpile.id,
                item_code=payload.item_code,
                quantity=payload.quantity,
            )
            self.session.add(row)
        else:
            row.quantity = payload.quantity
        await self.session.commit()
        await self.session.refresh(row)
        return row, self.t.t(
            "item.saved", domain=DOMAIN, item=row.item_code, quantity=row.quantity
        )

    async def patch_item(
        self, stockpile_id: uuid.UUID, item_code: str, payload: StockpileItemPatch
    ) -> tuple[StockpileItem, str]:
        await self.get_stockpile(stockpile_id)
        row = await self._get_item_row(stockpile_id, item_code, for_update=True)
        row.quantity = payload.quantity
        await self.session.commit()
        await self.session.refresh(row)
        return row, self.t.t(
            "item.saved", domain=DOMAIN, item=row.item_code, quantity=row.quantity
        )

    async def delete_item(self, stockpile_id: uuid.UUID, item_code: str) -> None:
        await self.get_stockpile(stockpile_id)
        row = await self._get_item_row(stockpile_id, item_code)
        await self.session.delete(row)
        await self.session.commit()
