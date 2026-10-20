from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DiscordSetup(Base):
    """Незавершённый Discord-вход (выбор сервера / вступление в клан).

    Серверы во владении и кланы с ролями пользователя не помещаются в куку
    (лимит браузера ~4 КБ — кука молча отбрасывается), поэтому состояние живёт
    здесь, а в куке только подписанный id. Строка удаляется при выборе сервера
    и вычищается по expires_at.
    """
    __tablename__ = "discord_setups"
    __table_args__ = (Index("ix_discord_setups_expires_at", "expires_at"),)

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
