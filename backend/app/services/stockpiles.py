from __future__ import annotations

import uuid
import hashlib
from datetime import UTC, datetime
from typing import Iterable, Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError, NotFoundError
from app.models.catalog import CatalogItem
from app.models.stockpile import Stockpile, StockpileItem
from app.schemas.stockpile import (
    StockpileContentsReplace,
    GameScanImport,
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
        stockpile = Stockpile(**payload.model_dump())
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

    async def replace_contents(
        self, stockpile_id: uuid.UUID, payload: StockpileContentsReplace
    ) -> tuple[Stockpile, Sequence[StockpileItem], str]:
        """Монитор склада: выгрузка сканера целиком заменяет содержимое (как PUT /api/storage
        старого сайта). Дубли кодов суммируются (ящики и россыпь — раздельно),
        неизвестные коды — 404 до любых изменений."""
        stockpile = await self._get_scoped(
            Stockpile, stockpile_id,
            not_found_key="stockpile.not_found", domain=DOMAIN, for_update=True,
        )
        merged: dict[str, list[int]] = {}       # код -> [ящики, россыпь]
        for entry in payload.items:
            slot = merged.setdefault(entry.item_code, [0, 0])
            i = 0 if entry.unit == "crate" else 1
            slot[i] = min(slot[i] + entry.quantity, 1_000_000)

        if merged:
            known = set(
                (
                    await self.session.execute(
                        select(CatalogItem.code).where(
                            CatalogItem.code.in_(merged), CatalogItem.is_active.is_(True)
                        )
                    )
                ).scalars()
            )
            unknown = sorted(set(merged) - known)
            if unknown:
                raise NotFoundError(
                    message_key="item.unknown_code", domain="catalog",
                    params={"code": ", ".join(unknown[:5])},
                )

        await self.session.execute(
            delete(StockpileItem).where(
                StockpileItem.clan_id == self.clan_id,
                StockpileItem.stockpile_id == stockpile.id,
            )
        )
        for code, (crates, loose) in merged.items():
            self.session.add(
                StockpileItem(
                    stockpile_id=stockpile.id, item_code=code, quantity=crates, loose_quantity=loose
                )
            )
        stockpile.last_sync_source = payload.source
        stockpile.last_sync_at = datetime.now(UTC)
        await self.session.commit()

        stockpile, items = await self.get_detail(stockpile.id)
        return stockpile, items, self.t.t(
            "stockpile.synced", domain=DOMAIN, name=stockpile.name, count=len(items)
        )

    @staticmethod
    def game_key(stockpile) -> str:
        """Stable identity excludes the user-editable in-game display name."""
        coords = stockpile.coords
        canonical = "|".join((
            stockpile.kind.strip().casefold(),
            stockpile.hex.strip().casefold(),
            f"{coords.x:.4f}",
            f"{coords.y:.4f}",
        ))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    async def import_game_scan(self, payload: GameScanImport) -> tuple[int, int, int]:
        """Atomically upsert named game stockpiles and replace only their contents."""
        entries: dict[str, object] = {}
        merged_by_key: dict[str, dict[str, list[int]]] = {}
        for entry in payload.stockpiles:
            key = self.game_key(entry)
            if key in entries:
                raise ConflictError(message_key="stockpile.scan_duplicate", domain=DOMAIN)
            entries[key] = entry
            merged: dict[str, list[int]] = {}
            for item in entry.items:
                slot = merged.setdefault(item.item_code, [0, 0])
                slot[0 if item.crated else 1] = min(slot[0 if item.crated else 1] + item.quantity, 1_000_000)
            merged_by_key[key] = merged

        all_codes = {code for items in merged_by_key.values() for code in items}
        if all_codes:
            known = set((await self.session.execute(
                select(CatalogItem.code).where(
                    CatalogItem.code.in_(all_codes), CatalogItem.is_active.is_(True)
                )
            )).scalars())
            unknown = sorted(all_codes - known)
            if unknown:
                raise NotFoundError(
                    message_key="item.unknown_code", domain="catalog",
                    params={"code": ", ".join(unknown[:5])},
                )

        existing = {}
        if entries:
            rows = (await self.session.execute(
                self._scoped(select(Stockpile), Stockpile)
                .where(Stockpile.game_key.in_(entries.keys()))
                .with_for_update()
            )).scalars().all()
            existing = {row.game_key: row for row in rows}

        created = updated = 0
        touched_ids = []
        for key, entry in entries.items():
            row = existing.get(key)
            if row is None:
                row = Stockpile(clan_id=self.clan_id, name=entry.name, region=entry.hex)
                self.session.add(row)
                created += 1
            else:
                row.name = entry.name
                row.region = entry.hex
                updated += 1
            row.town = entry.town
            row.kind = "seaport" if entry.kind.casefold() == "seaport" else "depot" if "depot" in entry.kind.casefold() else "other"
            row.game_key = key
            row.game_type = entry.kind
            row.faction = entry.faction
            row.game_x = entry.coords.x
            row.game_y = entry.coords.y
            row.game_scanned_at = payload.scanned_at
            row.last_sync_source = "scan"
            row.last_sync_at = datetime.now(UTC)
            touched_ids.append((row, key))

        item_rows = 0
        try:
            await self.session.flush()
            stockpile_ids = [row.id for row, _ in touched_ids]
            if stockpile_ids:
                await self.session.execute(delete(StockpileItem).where(
                    StockpileItem.clan_id == self.clan_id,
                    StockpileItem.stockpile_id.in_(stockpile_ids),
                ))
            for row, key in touched_ids:
                for code, (crates, loose) in merged_by_key[key].items():
                    self.session.add(StockpileItem(
                        stockpile_id=row.id, item_code=code,
                        quantity=crates, loose_quantity=loose,
                    ))
                    item_rows += 1
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            raise ConflictError(message_key="stockpile.scan_name_conflict", domain=DOMAIN) from exc
        return created, updated, item_rows

    async def catalog_brief(self, codes: Iterable[str]) -> dict[str, tuple[str, str, str | None]]:
        """code -> (русское название, английское название, иконка) для витрины позиций."""
        wanted = set(codes)
        if not wanted:
            return {}
        rows = await self.session.execute(
            select(
                CatalogItem.code, CatalogItem.name, CatalogItem.english_name, CatalogItem.icon_url
            ).where(CatalogItem.code.in_(wanted))
        )
        return {code: (name, name_en, icon) for code, name, name_en, icon in rows.all()}
