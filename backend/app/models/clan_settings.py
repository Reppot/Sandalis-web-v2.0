from __future__ import annotations

from sqlalchemy import Boolean, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin


class ClanSettings(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    """Настройки клана (одна строка на клан). Вебхук Discord — секрет: наружу
    отдаётся только признак «настроен» и хвост для узнавания."""
    __tablename__ = "clan_settings"
    __table_args__ = (UniqueConstraint("clan_id", name="uq_clan_settings_clan_id"),)

    discord_webhook_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # роли терминала по ролям Discord-сервера клана (services/discord_roles.py)
    discord_role_sync: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    discord_role_map: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict, server_default="{}", nullable=False)
