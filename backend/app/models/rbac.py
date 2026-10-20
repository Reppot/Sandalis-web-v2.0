from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.permissions import ClanRole
from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin

clan_role_enum = SAEnum(
    ClanRole,
    name="clan_role",
    native_enum=True,
    validate_strings=True,
    values_callable=lambda e: [m.value for m in e],
)


class Clan(Base, TimestampMixin):
    """Реестр арендаторов. Глобальная таблица — сама является ключом аренды."""
    __tablename__ = "clans"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    default_locale: Mapped[str] = mapped_column(String(8), default="en", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Discord-сервер клана: его владелец (флаг owner из OAuth scope=guilds) — owner клана
    discord_guild_id: Mapped[str | None] = mapped_column(String(32), nullable=True, unique=True)
    icon_url: Mapped[str | None] = mapped_column(String(512), nullable=True)


class User(Base, TimestampMixin):
    """Глобальная личность (Discord ID). Может состоять в нескольких кланах."""
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    preferred_locale: Mapped[str | None] = mapped_column(String(8), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)


class ClanMembership(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    """Связка user <-> clan с ролью. Clan-scoped: админ клана A не видит клан B."""
    __tablename__ = "clan_memberships"
    __table_args__ = (
        UniqueConstraint("clan_id", "user_id", name="uq_clan_memberships_clan_id_user_id"),
        Index("ix_clan_memberships_clan_role", "clan_id", "role"),
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[ClanRole] = mapped_column(
        clan_role_enum, default=ClanRole.MEMBER, nullable=False
    )
    extra_scopes: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    revoked_scopes: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped[User] = relationship(lazy="joined")


class ClanApiToken(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    """Клановый токен (X-Clan-Token / кука) для бота и shared-ссылок."""
    __tablename__ = "clan_api_tokens"
    __table_args__ = (
        Index("ix_clan_api_tokens_hash", "token_hash", unique=True),
    )

    label: Mapped[str] = mapped_column(String(64), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)      # sha256 hex
    role: Mapped[ClanRole] = mapped_column(
        clan_role_enum, default=ClanRole.GUEST, nullable=False
    )
    extra_scopes: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
