from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domain.timers import calculations


class TimerKind(StrEnum):
    STOCKPILE_DECAY = "stockpile_decay"   # default как в старом backend
    GENERIC = "generic"
    OPERATION = "operation"
    CUSTOM = "custom"


def _require_aware(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("datetime must be timezone-aware")
    return value


class TimerCreate(BaseModel):
    """
    Современный ввод: `ends_at` (aware ISO-8601).
    Legacy-ввод старого API: `target_timestamp` (мс epoch) + `duration_seconds`.
    Ровно один из двух путей обязателен.
    """
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: Annotated[str, Field(min_length=1, max_length=120)]
    kind: TimerKind = TimerKind.STOCKPILE_DECAY
    ends_at: datetime | None = None
    target_timestamp: Annotated[int | None, Field(default=None, gt=0)] = None
    duration_seconds: Annotated[int | None, Field(default=None, gt=0, le=365 * 24 * 3600)] = None
    note: Annotated[str | None, Field(default=None, max_length=2000)]
    stockpile_id: uuid.UUID | None = None

    @field_validator("ends_at")
    @classmethod
    def _aware(cls, v: datetime | None) -> datetime | None:
        return None if v is None else _require_aware(v)

    @model_validator(mode="after")
    def _one_window_source(self) -> Self:
        if (self.ends_at is None) == (self.target_timestamp is None):
            raise ValueError("provide exactly one of ends_at / target_timestamp")
        return self


class TimerUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: Annotated[str | None, Field(default=None, min_length=1, max_length=120)]
    kind: TimerKind | None = None
    ends_at: datetime | None = None
    note: Annotated[str | None, Field(default=None, max_length=2000)]
    stockpile_id: uuid.UUID | None = None
    completed: bool | None = None         # True -> завершить, False -> переоткрыть

    @field_validator("ends_at")
    @classmethod
    def _aware(cls, v: datetime | None) -> datetime | None:
        return None if v is None else _require_aware(v)


class TimerRead(BaseModel):
    # clan_id НЕ отдаём наружу
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    kind: str
    note: str | None
    stockpile_id: uuid.UUID | None
    starts_at: datetime
    ends_at: datetime
    duration_seconds: int
    completed_at: datetime | None
    created_by: str
    created_at: datetime
    updated_at: datetime
    # вычисляемое (app/domain/timers/calculations.py)
    remaining_seconds: int = 0
    remaining_display: str = "00:00:00"
    urgency: str = "normal"
    expired: bool = False
    progress: float = 0.0
    # legacy-поля старого TimerResponse — фронт может мигрировать постепенно
    type: str = ""
    target_timestamp: int = 0

    @classmethod
    def from_model(cls, timer, now: datetime | None = None) -> Self:  # noqa: ANN001
        now = now or datetime.now(UTC)
        remaining = calculations.remaining_seconds(timer, now)
        read = cls.model_validate(timer)
        return read.model_copy(update={
            "remaining_seconds": remaining,
            "remaining_display": calculations.format_remaining_time(remaining),
            "urgency": calculations.urgency(timer, now),
            "expired": calculations.is_expired(timer, now),
            "progress": calculations.progress(timer, now),
            "type": timer.kind,
            "target_timestamp": calculations.to_timestamp_ms(timer.ends_at),
        })


class TimerCreated(BaseModel):
    timer: TimerRead
    message: str
