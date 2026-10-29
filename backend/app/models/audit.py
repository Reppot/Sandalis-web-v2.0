from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin


class AuditEntry(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    """Журнал чувствительных действий в клане: роли и доступ, чёрный список, настройки,
    токены, удаление заказов, входы разработчика. Без секретов (URL вебхука, токены)."""
    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_log_clan_created", "clan_id", "created_at"),)

    actor_id: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_name: Mapped[str] = mapped_column(String(120), nullable=False)
    developer: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)
