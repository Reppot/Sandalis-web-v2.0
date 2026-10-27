from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import Date, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin


class ClanOperation(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    """Операция клана: дата в календаре, снимок карты из «Планирования» (кусок карты с планом),
    заказы, отмеченные на снимке, и список участников, которые отметились в опросе."""
    __tablename__ = "clan_operations"
    __table_args__ = (Index("ix_clan_operations_clan_date", "clan_id", "date"),)

    title: Mapped[str] = mapped_column(String(120), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str] = mapped_column(String(1000), nullable=False, default="")
    # снимок: {rect, war, phase, regions, shapes} — как в «Планировании»; None — операция без карты
    snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    report_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    # [{user_id, name, at}] — отметившиеся участники
    participants: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    author_id: Mapped[str] = mapped_column(String(64), nullable=False)
    author_name: Mapped[str] = mapped_column(String(120), nullable=False)
