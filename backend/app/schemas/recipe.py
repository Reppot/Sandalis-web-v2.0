from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class RecipeRead(BaseModel):
    """Рецепт Factory/MPF/Refinery. cost — {"bmat": 100} / {"salvage": 2}; data — поля вида."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    name: str
    name_en: str | None
    item_code: str | None
    category: str
    item_class: str | None
    description: str | None
    factions: list[str]
    facilities: list[str]
    icon_url: str | None
    output_quantity: int
    cost: dict[str, Any]
    data: dict[str, Any]
