from __future__ import annotations

from sqlalchemy import Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPkMixin


class Feedback(Base, UUIDPkMixin, TimestampMixin):
    """Обратная связь о сайте. Глобальная (не клановая): пишет любой вошедший участник,
    читает владелец сайта (FEEDBACK_ADMIN_IDS). Клан и ник сохраняются как были в момент отправки."""
    __tablename__ = "feedback"
    __table_args__ = (
        Index("ix_feedback_created", "created_at"),
        Index("ix_feedback_user", "user_id"),
    )

    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_name: Mapped[str] = mapped_column(String(120), nullable=False)
    clan_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    clan_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    category: Mapped[str] = mapped_column(String(16), nullable=False, default="idea")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    page: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="new")
