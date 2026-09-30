from typing import Any

from sqlalchemy import ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Item(TimestampMixin, Base):
    __tablename__ = "items"

    id: Mapped[str] = mapped_column(
        String(128),
        primary_key=True,
    )

    code: Mapped[str] = mapped_column(
        String(64),
        index=True,
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    english_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    category: Mapped[str] = mapped_column(
        String(64),
        index=True,
        nullable=False,
    )

    icon_url: Mapped[str | None] = mapped_column(
        String(512),
        nullable=True,
    )

    crate_size: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    production_time: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    recipes: Mapped[list["Recipe"]] = relationship(
        "Recipe",
        back_populates="item",
        cascade="all, delete-orphan",
    )


class Recipe(TimestampMixin, Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    item_id: Mapped[str] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    facility: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
    )

    ingredients: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON,
        nullable=False,
    )

    yield_quantity: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    item: Mapped["Item"] = relationship(
        "Item",
        back_populates="recipes",
    )