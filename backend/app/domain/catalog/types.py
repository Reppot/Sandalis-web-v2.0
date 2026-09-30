from dataclasses import dataclass
from typing import Literal

ItemCategory = Literal[
    "small_arms",
    "heavy_arms",
    "utilities",
    "medical",
    "resources",
    "uniforms",
    "vehicles",
]


@dataclass(frozen=True)
class DomainItem:
    id: str
    code: str
    name: str
    english_name: str
    category: ItemCategory
    icon_url: str | None = None
    crate_size: int = 1
    production_time: int = 0


@dataclass(frozen=True)
class RecipeIngredient:
    item_id: str
    quantity: int


@dataclass(frozen=True)
class DomainRecipe:
    item_id: str
    facility: str
    ingredients: tuple[RecipeIngredient, ...]
    yield_quantity: int = 1