from __future__ import annotations

from typing import Any

from sqlalchemy import Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ProductionRecipe(Base, TimestampMixin):
    """
    Рецепты производства — ГЛОБАЛЬНЫЙ справочник, как CatalogItem (без clan_id).

    kind="factory" — Factory/MPF (facilities говорит, где крафтится), kind="refinery" —
    переработка сырья. cost: {"bmat": 100, ...} или {"salvage": 2}; специфичные поля
    вида рецепта (секунды на единицу, лимиты слота, бонусы) — в data.
    item_code не FK: часть рецептов (техника, сооружения) не имеет кода в каталоге.
    """
    __tablename__ = "production_recipes"
    __table_args__ = (Index("ix_production_recipes_kind_sort", "kind", "sort"),)

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    name_en: Mapped[str | None] = mapped_column(String(160), nullable=True)
    item_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    item_class: Mapped[str | None] = mapped_column(String(64), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    factions: Mapped[list[str]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb"), nullable=False
    )
    facilities: Mapped[list[str]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb"), nullable=False
    )
    icon_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    output_quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    cost: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    data: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    sort: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
