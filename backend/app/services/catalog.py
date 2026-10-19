from __future__ import annotations

from typing import Iterable, Sequence

from sqlalchemy import select

from app.core.errors import NotFoundError
from app.domain.catalog.mapdata import parse_map_data
from app.domain.catalog.parsers import ParsedLine, parse_inventory_payload
from app.domain.catalog.resolve import CatalogIndex
from app.domain.catalog.search import build_conditions, build_order, escape_like
from app.models.catalog import CatalogItem
from app.models.recipe import ProductionRecipe
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
        faction: str | None = None,
        needs_review: bool | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[Sequence[CatalogItem], int]:
        stmt = select(CatalogItem).where(
            *build_conditions(
                CatalogItem, query=query, category=category, active_only=active_only
            )
        )
        if faction and faction != "all":
            stmt = stmt.where(CatalogItem.faction == faction)
        if needs_review is not None:
            stmt = stmt.where(CatalogItem.needs_review.is_(needs_review))
        total = await self._count(stmt)
        rows = (
            await self.session.execute(
                stmt.order_by(*build_order(CatalogItem, query))
                .limit(min(limit, 500))
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

    # ---------------- витрина / резолвер ------------------------------------ #
    async def by_codes(self, codes: Iterable[str]) -> dict[str, CatalogItem]:
        wanted = {c for c in codes if c}
        if not wanted:
            return {}
        rows = (
            await self.session.execute(select(CatalogItem).where(CatalogItem.code.in_(wanted)))
        ).scalars().all()
        return {row.code: row for row in rows}

    async def _active_items(self) -> Sequence[CatalogItem]:
        # ~400 строк: дешевле один SELECT и разбор в памяти, чем N запросов LIKE
        return (
            await self.session.execute(
                select(CatalogItem).where(CatalogItem.is_active.is_(True))
            )
        ).scalars().all()

    async def resolve_names(
        self, names: Iterable[str]
    ) -> list[tuple[str, CatalogItem | None]]:
        items = await self._active_items()
        by_code = {item.code: item for item in items}
        index = CatalogIndex.build(items)
        return [(name, by_code.get(index.resolve(name) or "")) for name in names]

    async def parse(self, text: str) -> list[tuple[ParsedLine, CatalogItem | None]]:
        lines = parse_inventory_payload(text)
        resolved = await self.resolve_names(line.name for line in lines)
        return [(line, item) for line, (_, item) in zip(lines, resolved)]

    async def scan_map_data(
        self, buf: bytes
    ) -> tuple[list[tuple[ParsedLine, CatalogItem]], bool]:
        items = await self._active_items()
        by_code = {item.code: item for item in items}
        result = parse_map_data(buf, by_code)
        lines = [
            (ParsedLine(name=by_code[code].name, count=count, unit="unit"), by_code[code])
            for code, count in sorted(
                result.counts.items(), key=lambda kv: by_code[kv[0]].name.lower()
            )
        ]
        return lines, result.strict

    # ---------------- рецепты ------------------------------------------------ #
    async def list_recipes(
        self,
        *,
        kind: str | None = None,
        facility: str | None = None,
        faction: str | None = None,
        category: str | None = None,
        query: str = "",
    ) -> Sequence[ProductionRecipe]:
        stmt = select(ProductionRecipe)
        if kind:
            stmt = stmt.where(ProductionRecipe.kind == kind)
        if facility:
            stmt = stmt.where(ProductionRecipe.facilities.contains([facility]))
        if faction and faction != "all":
            stmt = stmt.where(ProductionRecipe.factions.contains([faction]))
        if category and category != "all":
            stmt = stmt.where(ProductionRecipe.category == category)
        clean = query.strip()
        if clean:
            pattern = f"%{escape_like(clean)}%"
            stmt = stmt.where(
                ProductionRecipe.name.ilike(pattern, escape="\\")
                | ProductionRecipe.name_en.ilike(pattern, escape="\\")
                | ProductionRecipe.item_class.ilike(pattern, escape="\\")
            )
        stmt = stmt.order_by(ProductionRecipe.kind, ProductionRecipe.sort)
        return (await self.session.execute(stmt)).scalars().all()
