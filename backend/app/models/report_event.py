from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin


class ReportEvent(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    """Лента заказа («штаб»): создан, статус, назначения, приоритет, срок, теги, операция,
    вклад в выполнение, «доставлен полностью» и комментарии. payload — детали для текста,
    который сайт соберёт на языке читателя."""
    __tablename__ = "report_events"
    __table_args__ = (Index("ix_report_events_report", "report_id", "created_at"),)

    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("order_reports.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_name: Mapped[str] = mapped_column(String(120), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
