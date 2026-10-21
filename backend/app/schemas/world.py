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
