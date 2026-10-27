from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin


class ClanMail(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    """Почта на сайте: письмо одному участнику клана. kind — что случилось (упоминание роли
    в операции и т. п.), payload — данные для текста, который сайт соберёт на языке читателя."""
    __tablename__ = "clan_mail"
    __table_args__ = (Index("ix_clan_mail_recipient", "clan_id", "recipient_id", "created_at"),)

    recipient_id: Mapped[str] = mapped_column(String(64), nullable=False)
    sender_id: Mapped[str] = mapped_column(String(64), nullable=False)
    sender_name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
