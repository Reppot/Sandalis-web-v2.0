from __future__ import annotations

from sqlalchemy import String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin


class ClanSettings(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    """Настройки клана (одна строка на клан). Вебхук Discord — секрет: наружу
    отдаётся только признак «настроен» и хвост для узнавания."""
    __tablename__ = "clan_settings"
    __table_args__ = (UniqueConstraint("clan_id", name="uq_clan_settings_clan_id"),)

    discord_webhook_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
