from __future__ import annotations

from typing import Sequence

from sqlalchemy import select

from app.core.errors import NotFoundError
from app.domain.catalog.search import build_conditions, build_order
from app.models.catalog import CatalogItem
from app.services.base import ClanScopedService

DOMAIN = "catalog"


class CatalogService(ClanScopedService):
    """
    Глобальный справочник: таблица НЕ clan-scoped, поэтому _scoped() здесь
    осознанно не используется (do_orm_execute её тоже не трогает). Principal/
    ClanSession всё равно требуются — чтение каталога только у авторизованных
    (даже гостям клана разрешено catalog:read).
    """

    async def list_items(
        self,
        *,
        query: str = "",
        category: str | None = None,
        active_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[Sequence[CatalogItem], int]:
        stmt = select(CatalogItem).where(
            *build_conditions(
                CatalogItem, query=query, category=category, active_only=active_only
            )
        )
        total = await self._count(stmt)
        rows = (
            await self.session.execute(
                stmt.order_by(*build_order(CatalogItem, query))
                .limit(min(limit, 200))
                .offset(offset)
            )
        ).scalars().all()
        return rows, total

    async def list_for_legacy_codes_endpoint(
        self, *, query: str = "", category: str | None = None, limit: int = 200
    ) -> Sequence[CatalogItem]:
        """Семантика старого GET /api/v1/codes: без пагинации, до 5000 строк."""
        stmt = (
            select(CatalogItem)
            .where(*build_conditions(CatalogItem, query=query, category=category))
            .order_by(*build_order(CatalogItem, query))
            .limit(max(1, min(limit, 5000)))
        )
        return (await self.session.execute(stmt)).scalars().all()

    async def get_item(self, code: str) -> CatalogItem:
        item = (
            await self.session.execute(
                select(CatalogItem).where(CatalogItem.code == code)
            )
        ).scalar_one_or_none()
        if item is None:
            raise NotFoundError(
                message_key="item.unknown_code", domain=DOMAIN, params={"code": code}
            )
        return item
