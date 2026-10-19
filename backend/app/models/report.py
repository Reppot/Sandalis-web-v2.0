from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin


class ReportStatus(StrEnum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CANCELLED = "cancelled"


REPORT_TRANSITIONS: dict[ReportStatus, frozenset[ReportStatus]] = {
    ReportStatus.OPEN: frozenset(
        {ReportStatus.IN_PROGRESS, ReportStatus.DONE, ReportStatus.CANCELLED}
    ),
    ReportStatus.IN_PROGRESS: frozenset(
        {ReportStatus.OPEN, ReportStatus.DONE, ReportStatus.CANCELLED}
    ),
    ReportStatus.DONE: frozenset({ReportStatus.IN_PROGRESS}),
    ReportStatus.CANCELLED: frozenset({ReportStatus.OPEN}),
}


class OrderReport(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    """
    Рапорт снабжения — многострочный заказ из «Конструктора заказа» старого сайта.
    Строки ссылаются на каталог мягко (item_code nullable): рапорт может прийти
    из сканера/Discord с названием, которого ещё нет в каталоге.
    meta — шапка графического рапорта: {"region": ..., "type": ..., "stockpile": ...}.
    """
    __tablename__ = "order_reports"
    __table_args__ = (
        Index("ix_order_reports_clan_status_created", "clan_id", "status", "created_at"),
        CheckConstraint(
            "status IN ('open', 'in_progress', 'done', 'cancelled')", name="status_known"
        ),
    )

    title: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), default=ReportStatus.OPEN.value, nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    discord_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    lines: Mapped[list[OrderReportLine]] = relationship(
        back_populates="report",
        cascade="all, delete-orphan",
        order_by="OrderReportLine.position",
        lazy="selectin",
    )


class OrderReportLine(Base, UUIDPkMixin, ClanScopedMixin):
    __tablename__ = "order_report_lines"
    __table_args__ = (
        Index("ix_order_report_lines_clan_report", "clan_id", "report_id"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit IN ('crate', 'unit')", name="unit_known"),
    )

    report_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("order_reports.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    item_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit: Mapped[str] = mapped_column(String(8), default="crate", nullable=False)

    report: Mapped[OrderReport] = relationship(back_populates="lines")
