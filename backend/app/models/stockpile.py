from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin


class Stockpile(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    __tablename__ = "stockpiles"
    __table_args__ = (
        UniqueConstraint("clan_id", "name", name="uq_stockpiles_clan_id_name"),
    )

    name: Mapped[str] = mapped_column(String(80), nullable=False)
    region: Mapped[str] = mapped_column(String(64), nullable=False)
    # 0005: источник и время последней полной выгрузки содержимого (монитор склада)
    last_sync_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class StockpileItem(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    __tablename__ = "stockpile_items"
    __table_args__ = (
        Index("ix_stockpile_items_clan_item", "clan_id", "item_code"),
        UniqueConstraint(
            "stockpile_id", "item_code",
            name="uq_stockpile_items_stockpile_id_item_code",
        ),
    )

    stockpile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stockpiles.id", ondelete="CASCADE"), nullable=False
    )
    item_code: Mapped[str] = mapped_column(
        ForeignKey("catalog_items.code"), nullable=False
    )
    quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
