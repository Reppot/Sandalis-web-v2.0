from __future__ import annotations

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CatalogItem(Base):
    """
    Справочник предметов — ГЛОБАЛЬНЫЙ, общий для всех кланов.

    Осознанно БЕЗ ClanScopedMixin и clan_id: справочник одинаков для всех
    арендаторов, дублирование его по кланам впустую жрёт лимит 500 МБ.
    Поля name/english_name/icon_url/production_time перенесены из старого
    backend (models/item.py) — добавлены миграцией 0003, унаследованные
    строки бэкфиллируются значением code.
    """
    __tablename__ = "catalog_items"

    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(
        String(255), default="", server_default="", nullable=False
    )
    english_name: Mapped[str] = mapped_column(
        String(255), default="", server_default="", nullable=False
    )
    category: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    icon_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    crate_size: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    production_time: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
