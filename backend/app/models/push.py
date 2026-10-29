from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPkMixin


class PushSubscription(Base, UUIDPkMixin, TimestampMixin):
    """Подписка браузера на push-уведомления (Web Push). Глобальная: пользователь, не клан."""
    __tablename__ = "push_subscriptions"

    user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(String(600), nullable=False, unique=True)
    p256dh: Mapped[str] = mapped_column(String(200), nullable=False)
    auth: Mapped[str] = mapped_column(String(100), nullable=False)
