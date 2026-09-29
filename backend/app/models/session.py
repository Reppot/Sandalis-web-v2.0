from datetime import datetime

from sqlalchemy.orm import Mapped, mapped_column

from app.models.order import Base


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(primary_key=True)  # uuid в cookie
    user_id: Mapped[int]
    expires_at: Mapped[datetime]  # TTL — из settings.session_ttl_min

    # раз в час воркер чистит протухшие строки:
    # delete where expires_at < now()
