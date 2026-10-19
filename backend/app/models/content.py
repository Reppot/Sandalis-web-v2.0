from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPkMixin


class AppContent(Base, UUIDPkMixin, TimestampMixin):
    """
    Глобальный реестр контента интерфейса: всё, что старый сайт держал статикой
    во фронтенде, — медиа (видео входа, фоны), внешние инструменты, модули
    обучения, фразы бегущей строки, регионы, подписи категорий и материалов.

    Один источник для веба и будущего десктоп-клиента. payload — свободная форма
    под kind (см. app/seed/data/content.json).
    """
    __tablename__ = "app_content"
    __table_args__ = (
        UniqueConstraint("kind", "key", name="uq_app_content_kind_key"),
        Index("ix_app_content_kind_sort", "kind", "sort"),
    )

    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    sort: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False
    )
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb"), nullable=False
    )
