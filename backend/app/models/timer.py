import uuid

from sqlalchemy import BigInteger, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Timer(TimestampMixin, Base):
    __tablename__ = "timers"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    type: Mapped[str] = mapped_column(
        String(64),
        default="stockpile_decay",
        nullable=False,
    )

    target_timestamp: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    duration_seconds: Mapped[int] = mapped_column(
        Integer,
        default=172800,
        nullable=False,
    )

    created_by: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )