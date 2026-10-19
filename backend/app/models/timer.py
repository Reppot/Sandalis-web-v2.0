from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin


class Timer(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    __tablename__ = "timers"
    __table_args__ = (
        # листинг «ближайшие дедлайны клана» — один индекс на аренду+сортировку
        Index("ix_timers_clan_ends", "clan_id", "ends_at"),
    )

    title: Mapped[str] = mapped_column(String(120), nullable=False)
    # старый backend: type="stockpile_decay" по умолчанию
    kind: Mapped[str] = mapped_column(
        String(32), default="stockpile_decay", nullable=False
    )
    # старый backend: duration_seconds=172800 (48 часов распада)
    duration_seconds: Mapped[int] = mapped_column(
        Integer, default=172800, nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    stockpile_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("stockpiles.id", ondelete="SET NULL"), nullable=True
    )
    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)


class TimerEvent(Base, UUIDPkMixin, ClanScopedMixin):
    """Журнал таймера: заметки интенданта и системные записи (сброс, установка)."""
    __tablename__ = "timer_events"
    __table_args__ = (
        Index("ix_timer_events_clan_timer_created", "clan_id", "timer_id", "created_at"),
    )

    timer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("timers.id", ondelete="CASCADE"), nullable=False
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
