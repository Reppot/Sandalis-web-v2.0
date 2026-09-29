from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.models.order import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    discord_id: Mapped[str] = mapped_column(unique=True)
    nickname: Mapped[str]
    roles: Mapped[list[str]] = mapped_column(JSON, default=list)
