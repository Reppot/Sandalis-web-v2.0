from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import Boolean, Date, DateTime, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin


class ClanOperation(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    """Операция клана: дата в календаре, снимки карты из «Планирования» (куски карты с планом),
    заказы, отмеченные на снимке, и список участников, которые отметились в опросе."""
    __tablename__ = "clan_operations"
    __table_args__ = (Index("ix_clan_operations_clan_date", "clan_id", "date"),)

    title: Mapped[str] = mapped_column(String(120), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str] = mapped_column(String(1000), nullable=False, default="")
    # снимки карты из «Планирования»: [{name, rect, war, phase, regions, shapes}], может быть пусто
    snapshots: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    report_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    # [{user_id, name, at}] — отметившиеся участники
    participants: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    author_id: Mapped[str] = mapped_column(String(64), nullable=False)
    author_name: Mapped[str] = mapped_column(String(120), nullable=False)
    # время начала (с часовым поясом автора); нет — событие в Discord на 18:00 UTC
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # пост бота в канале клана, его ветка и событие сервера Discord; напоминание за час — одно
    discord_channel_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    discord_message_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    discord_thread_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    discord_event_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reminded: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
