from __future__ import annotations

from sqlalchemy import String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin


class GameAward(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    """Полученная награда (ступень достижения или лига) — чтобы поздравить один раз.
    key: ach:<достижение>:<ступень> | league:<лига>."""
    __tablename__ = "game_awards"
    __table_args__ = (UniqueConstraint("clan_id", "user_id", "key", name="uq_game_awards"),)

    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    key: Mapped[str] = mapped_column(String(48), nullable=False)
