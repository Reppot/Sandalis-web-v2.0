from sqlalchemy.orm import Mapped, mapped_column

from app.models.order import Base


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(unique=True)  # soldier_supplies
    name: Mapped[str]
    icon_key: Mapped[str]  # webp в CDN, а не в public/FoxholeWikiPhotos
