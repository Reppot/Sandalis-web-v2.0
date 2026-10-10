from __future__ import annotations

from typing import Self

from pydantic import BaseModel, ConfigDict


class CatalogItemRead(BaseModel):
    """
    Плоская форма совместима со старым ItemResponse фронта
    (id/name/english_name/icon_url/production_time); id == code.
    clan_id в модели нет — в схеме не появится.
    """
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    name: str
    english_name: str
    category: str
    icon_url: str | None
    crate_size: int
    production_time: int
    is_active: bool

    @classmethod
    def from_item(cls, item) -> Self:  # noqa: ANN001
        return cls(
            id=item.code,
            code=item.code,
            name=item.name,
            english_name=item.english_name,
            category=item.category,
            icon_url=item.icon_url,
            crate_size=item.crate_size,
            production_time=item.production_time,
            is_active=item.is_active,
        )
