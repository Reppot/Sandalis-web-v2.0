from datetime import datetime

from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int]
    quantity: Mapped[int]
    status: Mapped[str] = mapped_column(default="new")
    deadline: Mapped[datetime]
