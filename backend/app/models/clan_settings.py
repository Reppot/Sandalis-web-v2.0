from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin


class ClanSettings(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    """Настройки клана (одна строка на клан). Вебхук Discord — секрет: наружу
    отдаётся только признак «настроен» и хвост для узнавания."""
    __tablename__ = "clan_settings"
    __table_args__ = (UniqueConstraint("clan_id", name="uq_clan_settings_clan_id"),)

    discord_webhook_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # роли Discord-сервера клана (services/discord_roles.py): снимок ролей, который
    # подтягивает командир, и уровни доступа {id роли: basic|medium|high}
    discord_roles: Mapped[list[dict]] = mapped_column(JSONB, default=list, server_default="[]", nullable=False)
    discord_roles_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    discord_role_map: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)
