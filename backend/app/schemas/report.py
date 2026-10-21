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


# --------------------------------------------------------------------------- #
# Журнал выполнения заказа
# --------------------------------------------------------------------------- #
class ContributionLineIn(BaseModel):
    line_id: uuid.UUID
    quantity: Annotated[int, Field(gt=0, le=100_000)]


class ContributionCreate(BaseModel):
    """«Сообщить о выполнении»: сколько каких строк привезено и на какой склад."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    lines: Annotated[list[ContributionLineIn], Field(min_length=1, max_length=200)]
    stockpile_id: uuid.UUID | None = None
    # склад не из списка клана (бункерная база, чужой склад) — подписью
    stockpile_label: Annotated[str | None, Field(default=None, max_length=160)]
    note: Annotated[str | None, Field(default=None, max_length=500)]


class ProgressLineRead(BaseModel):
    line_id: uuid.UUID
    name: str
    item_code: str | None
    icon_url: str | None
    unit: Unit
    ordered: int
    delivered: int


class ContributionLineRead(BaseModel):
    line_id: uuid.UUID
    name: str
    icon_url: str | None
    unit: Unit
    quantity: int


class ContributionRead(BaseModel):
    id: uuid.UUID
    user_id: str
    user_name: str | None
    stockpile_id: uuid.UUID | None
    stockpile_label: str | None
    note: str | None
    created_at: datetime
    lines: list[ContributionLineRead]


class ReportProgressRead(BaseModel):
    report_id: uuid.UUID
    lines: list[ProgressLineRead]
    contributions: list[ContributionRead]      # новые сверху
    ordered_total: int
    delivered_total: int
    message: str | None = None
