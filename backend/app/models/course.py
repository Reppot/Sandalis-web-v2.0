from __future__ import annotations

from sqlalchemy import Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin


class ClanCourse(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    """Курс клана в разделе «Обучение»: пишет командир или офицер с правом clan:content,
    читают участники клана. Текст — простая разметка (## заголовки, списки, **жирный**, ссылки, картинки)."""
    __tablename__ = "clan_courses"
    __table_args__ = (Index("ix_clan_courses_clan_sort", "clan_id", "sort"),)

    title: Mapped[str] = mapped_column(String(120), nullable=False)
    summary: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    author_id: Mapped[str] = mapped_column(String(64), nullable=False)
    author_name: Mapped[str] = mapped_column(String(120), nullable=False)
