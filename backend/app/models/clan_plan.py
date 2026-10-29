from __future__ import annotations

from typing import Any

from sqlalchemy import Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin


class ClanPlan(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    """Общий план клана в «Планировании» (одна строка на клан): объекты на карте, которые
    офицеры рисуют вместе. version растёт с каждой правкой — клиенты подтягивают изменения."""
    __tablename__ = "clan_plans"
    __table_args__ = (UniqueConstraint("clan_id", name="uq_clan_plans_clan_id"),)

    shapes: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_by_name: Mapped[str] = mapped_column(String(120), nullable=False, default="")
