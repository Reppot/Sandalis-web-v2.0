from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


# тип постройки склада: порт, депо (Storage Depot) или другое
StockpileKind = Literal["seaport", "depot", "other"]


class StockpileCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: Annotated[str, Field(min_length=1, max_length=80)]
    region: Annotated[str, Field(min_length=1, max_length=64)]
    town: Annotated[str | None, Field(default=None, max_length=80)]
    kind: Annotated[StockpileKind | None, Field(default=None)]
    access_code: Annotated[str | None, Field(default=None, max_length=32)]


class StockpileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: Annotated[str | None, Field(default=None, min_length=1, max_length=80)]
    region: Annotated[str | None, Field(default=None, min_length=1, max_length=64)]
    town: Annotated[str | None, Field(default=None, max_length=80)]
    kind: Annotated[StockpileKind | None, Field(default=None)]
    access_code: Annotated[str | None, Field(default=None, max_length=32)]


class StockpileRead(BaseModel):
    # clan_id НЕ отдаём наружу
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    region: str
    town: str | None = None
    kind: str | None = None
    access_code: str | None = None   # пароль склада виден только участникам клана
    created_at: datetime
    updated_at: datetime
    items_count: int = 0        # заполняет сервис агрегатом
    total_quantity: int = 0     # заполняет сервис агрегатом
    last_sync_source: str | None = None
    last_sync_at: datetime | None = None


class StockpileCreated(BaseModel):
    stockpile: StockpileRead
    message: str


class StockpileItemUpsert(BaseModel):
    """Идемпотентный upsert позиции: quantity — целевое абсолютное значение."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    item_code: Annotated[str, Field(min_length=1, max_length=64)]
    quantity: Annotated[int, Field(gt=0, le=1_000_000)]


class StockpileItemPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: Annotated[int, Field(gt=0, le=1_000_000)]


class StockpileItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    item_code: str
    quantity: int
    loose_quantity: int = 0
    created_at: datetime
    updated_at: datetime
    # витрина из каталога — клиенту не нужно отдельно резолвить коды
    name: str | None = None
    name_en: str | None = None
    icon_url: str | None = None


SyncSource = Literal["json", "txt", "clipboard", "xlsx", "scan", "manual"]


class StockpileContentsLine(BaseModel):
    """Строка выгрузки сканера: ящики (crate) или предметы не в ящиках (unit)."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    item_code: Annotated[str, Field(min_length=1, max_length=64)]
    quantity: Annotated[int, Field(gt=0, le=1_000_000)]
    unit: Literal["crate", "unit"] = "crate"


class StockpileContentsReplace(BaseModel):
    """Полная замена содержимого склада выгрузкой сканера (монитор склада).
    Позиции с одинаковым кодом суммируются; пустой список очищает склад."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source: SyncSource = "manual"
    items: Annotated[list[StockpileContentsLine], Field(max_length=2000)]


class StockpileDetailRead(StockpileRead):
    items: list[StockpileItemRead] = []


class StockpileItemSaved(BaseModel):
    item: StockpileItemRead
    message: str


class StockpileContentsSaved(BaseModel):
    stockpile: StockpileDetailRead
    message: str
