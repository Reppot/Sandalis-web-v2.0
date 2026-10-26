from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class TownRead(BaseModel):
    name: str
    major: bool                     # крупный город (Major) или малая отметка (Minor)
    x: float                        # координаты в долях карты региона (0..1)
    y: float
    owner: Literal["colonials", "wardens", "neutral"] | None
    victory: bool                   # город победы
    scorched: bool
    facilities: list[str]           # storage | seaport | refinery | factory | mpf | hospital | ...


class RegionRead(BaseModel):
    key: str                        # имя карты War API: DeadLandsHex
    name: str
    towns: list[TownRead]
    colonials: int                  # крупных городов у колонистов
    wardens: int
    victory: int                    # городов победы в регионе


class WarRead(BaseModel):
    number: int | None
    winner: str | None
    required_victory_towns: int | None
    started_at: int | None          # мс epoch
    victory_towns: dict[str, int]


class WorldRead(BaseModel):
    """Регионы и города текущей войны (официальный Foxhole War API, кеш сервера)."""
    war: WarRead
    regions: list[RegionRead]
    source: str


class MapItemRead(BaseModel):
    kind: Literal["town_hall", "relic", "storage", "seaport", "coastal_gun", "runway"]
    tier: int | None                # уровень ратуши / реликвии / аэродрома
    team: Literal["colonials", "wardens", "neutral"]
    x: float                        # доли картинки гекса (0..1)
    y: float
    victory: bool
    scorched: bool


class MapLabelRead(BaseModel):
    text: str
    x: float
    y: float
    major: bool                     # крупный город (Major) или малая отметка


class MapRegionRead(BaseModel):
    key: str                        # имя карты War API: DeadLandsHex
    slug: str                       # картинка static/maps/hex/<slug>.webp
    name: str
    col: int                        # колонка сетки шестиугольников
    row: int                        # полу-ряд
    items: list[MapItemRead]
    labels: list[MapLabelRead]      # города и отметки карты


class WorldMapRead(BaseModel):
    """Суточный снимок карты войны для «Планирования» (кеш сервера)."""
    war_number: int | None
    phase: Literal["conquest", "resistance"]   # resistance — между войнами, построек нет
    winner: Literal["colonials", "wardens"] | None
    updated_at: str
    next_update_at: str
    regions: list[MapRegionRead]
    source: str
