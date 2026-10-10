from __future__ import annotations

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CatalogItem(Base):
    """
    Справочник предметов — ГЛОБАЛЬНЫЙ, общий для всех кланов.

    Осознанно БЕЗ ClanScopedMixin и clan_id: справочник одинаков для всех
    арендаторов, дублирование его по кланам впустую жрёт лимит 500 МБ.
    """
    __tablename__ = "catalog_items"

    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    category: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    crate_size: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
