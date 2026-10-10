from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, ClassVar

from sqlalchemy import DateTime, ForeignKey, Index, MetaData, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Единая конвенция имён — иначе Alembic autogenerate будет плодить мусор
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(AsyncAttrs, DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)

    type_annotation_map: ClassVar[dict] = {
        str: String,
        dict[str, Any]: JSONB,
        list[str]: JSONB,
        datetime: DateTime(timezone=True),
        uuid.UUID: PgUUID(as_uuid=True),
    }

    def __repr__(self) -> str:  # pragma: no cover
        pk = getattr(self, "id", None)
        return f"<{type(self).__name__} id={pk}>"


class UUIDPkMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class ClanScopedMixin:
    """
    Discriminator Column для Shared DB / Shared Schema мультиарендности.

    ВАЖНО:
      * любая модель, унаследованная от этого миксина, автоматически попадает
        под глобальный фильтр `with_loader_criteria` (app/core/tenancy.py);
      * `isinstance(obj, ClanScopedMixin)` используется в before_flush-гварде;
      * глобальные справочники (CatalogItem, Clan, User) от миксина НЕ наследуются.

    Экономия места (лимит Supabase 500 МБ): String(64) вместо UUID+FK даёт
    компактный ключ и позволяет класть clan_id первым полем составного индекса —
    один B-tree обслуживает и фильтр арендатора, и сортировку/статусы.
    """

    # FK по имени таблицы строкой — циклического импорта на models.rbac нет,
    # зато целостность аренды гарантирована самой БД (и autogenerate не дрейфует).
    clan_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("clans.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    @classmethod
    def clan_index(cls, *columns: str, name: str | None = None) -> Index:
        """Хелпер для составных индексов: всегда clan_id первым столбцом."""
        table = cls.__tablename__  # type: ignore[attr-defined]
        idx_name = name or f"ix_{table}_clan_{'_'.join(columns)}"
        return Index(idx_name, "clan_id", *columns)
