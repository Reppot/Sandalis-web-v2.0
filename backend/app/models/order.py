from __future__ import annotations

from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ClanScopedMixin, TimestampMixin, UUIDPkMixin


class OrderStatus(StrEnum):
    DRAFT = "draft"
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CANCELLED = "cancelled"


ALLOWED_TRANSITIONS: dict[OrderStatus, frozenset[OrderStatus]] = {
    OrderStatus.DRAFT: frozenset({OrderStatus.QUEUED, OrderStatus.CANCELLED}),
    OrderStatus.QUEUED: frozenset({OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED}),
    OrderStatus.IN_PROGRESS: frozenset({OrderStatus.DONE, OrderStatus.CANCELLED}),
    OrderStatus.DONE: frozenset(),
    OrderStatus.CANCELLED: frozenset(),
}

order_status_enum = SAEnum(
    OrderStatus,
    name="order_status",
    native_enum=True,
    # PG-enum хранит ЗНАЧЕНИЯ ("draft"), а не имена ("DRAFT"):
    # иначе INSERT падает 'invalid input value for enum' и DDL дрейфует от миграций.
    values_callable=lambda e: [m.value for m in e],
)


class Order(Base, UUIDPkMixin, ClanScopedMixin, TimestampMixin):
    __tablename__ = "orders"
    __table_args__ = (
        # clan_id ПЕРВЫМ столбцом: один индекс и для изоляции, и для листинга
        Index("ix_orders_clan_status_created", "clan_id", "status", "created_at"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
    )

    title: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[OrderStatus] = mapped_column(
        order_status_enum, default=OrderStatus.DRAFT, nullable=False
    )
    item_code: Mapped[str] = mapped_column(
        ForeignKey("catalog_items.code", ondelete="RESTRICT"), nullable=False
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    produced: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), nullable=False)
    assignee_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
