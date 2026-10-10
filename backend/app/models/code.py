from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.permissions import ClanRole
from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin

invite_role_enum = SAEnum(
    ClanRole,
    name="clan_role",          # переиспользуем существующий PG-enum
    native_enum=True,
    validate_strings=True,
    values_callable=lambda e: [m.value for m in e],
    create_type=False,         # тип уже создан миграцией 0001
)


class ClanInviteCode(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    """Одно-/многоразовый пригласительный код в клан. Принадлежит клану."""
    __tablename__ = "clan_invite_codes"
    __table_args__ = (
        Index("ix_clan_invite_codes_code", "code", unique=True),
    )

    code: Mapped[str] = mapped_column(String(24), nullable=False)
    role: Mapped[ClanRole] = mapped_column(
        invite_role_enum, default=ClanRole.MEMBER, nullable=False
    )
    max_uses: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    used_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
