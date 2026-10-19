from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.report import ReportStatus

Unit = Literal["crate", "unit"]


class ReportMeta(BaseModel):
    """Шапка графического рапорта (как поля «Гекс / Тип / Склад» старого сайта)."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    region: Annotated[str | None, Field(default=None, max_length=64)]
    type: Annotated[str | None, Field(default=None, max_length=64)]
    stockpile: Annotated[str | None, Field(default=None, max_length=80)]


class ReportLineIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: Annotated[str, Field(min_length=1, max_length=160)]
    item_code: Annotated[str | None, Field(default=None, max_length=64)]
    quantity: Annotated[int, Field(gt=0, le=1_000_000)]
    unit: Unit = "crate"


class ReportCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: Annotated[str | None, Field(default=None, max_length=160)]
    note: Annotated[str | None, Field(default=None, max_length=2000)]
    meta: ReportMeta = ReportMeta()
    lines: Annotated[list[ReportLineIn], Field(min_length=1, max_length=500)]


class ReportUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: Annotated[str | None, Field(default=None, min_length=1, max_length=160)]
    note: Annotated[str | None, Field(default=None, max_length=2000)]
    meta: ReportMeta | None = None
    lines: Annotated[list[ReportLineIn] | None, Field(default=None, min_length=1, max_length=500)]


class ReportStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ReportStatus


class ReportLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    position: int
    name: str
    item_code: str | None
    quantity: int
    unit: Unit
    icon_url: str | None = None      # витрина из каталога


class ReportRead(BaseModel):
    # clan_id НЕ отдаём наружу
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    status: ReportStatus
    note: str | None
    meta: dict[str, str | None]
    created_by: str
    created_by_name: str | None
    discord_sent_at: datetime | None
    created_at: datetime
    updated_at: datetime
    lines: list[ReportLineRead]
    lines_count: int = 0
    total_quantity: int = 0


class ReportSaved(BaseModel):
    report: ReportRead
    message: str


class DiscordSent(BaseModel):
    report: ReportRead
    message: str
