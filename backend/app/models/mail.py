from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPkMixin


class ClanMail(Base, UUIDPkMixin, TimestampMixin):
    """Почта на сайте: письмо одному пользователю. Общая для сайта, не клановая: сюда приходят
    и упоминания ролей в операциях клана (clan_id — клан операции), и ответы разработчика на
    обратную связь (clan_id может не быть). kind — что случилось, payload — данные для текста,
    который сайт соберёт на языке читателя."""
    __tablename__ = "clan_mail"
    __table_args__ = (Index("ix_clan_mail_user", "recipient_id", "created_at"),)

    clan_id: Mapped[str | None] = mapped_column(ForeignKey("clans.id", ondelete="CASCADE"), nullable=True)

    recipient_id: Mapped[str] = mapped_column(String(64), nullable=False)
    sender_id: Mapped[str] = mapped_column(String(64), nullable=False)
    sender_name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # разослано вне сайта (ЛС Discord / push в браузер) — или решено не рассылать
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
