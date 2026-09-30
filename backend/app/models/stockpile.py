import uuid

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Stockpile(TimestampMixin, Base):
    __tablename__ = "stockpiles"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    creator_id: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    assignee_id: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(32),
        default="pending",
        index=True,
        nullable=False,
    )

    destination: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    items: Mapped[list["StockpileItem"]] = relationship(
        "StockpileItem",
        back_populates="stockpile",
        cascade="all, delete-orphan",
    )


class StockpileItem(Base):
    __tablename__ = "stockpile_items"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    stockpile_id: Mapped[str] = mapped_column(
        ForeignKey("stockpiles.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    item_id: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
    )

    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    completed_quantity: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    stockpile: Mapped["Stockpile"] = relationship(
        "Stockpile",
        back_populates="items",
    )