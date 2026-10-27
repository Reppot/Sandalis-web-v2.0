from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

# снимок карты небольшой (кусок гексов + объекты плана), но ограничим, чтобы не раздувать базу
MAX_SNAPSHOT_BYTES = 400_000


class OperationWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Annotated[str, Field(min_length=1, max_length=120)]
    date: date
    note: Annotated[str, Field(max_length=1000)] = ""

    @field_validator("title")
    @classmethod
    def _title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("empty title")
        return value

    @field_validator("note")
    @classmethod
    def _note(cls, value: str) -> str:
        return value.strip()


class OperationCreate(OperationWrite):
    snapshot: dict[str, Any] | None = None

    @field_validator("snapshot")
    @classmethod
    def _snapshot(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        if not isinstance(value.get("rect"), dict) or not isinstance(value.get("shapes"), list) or not isinstance(value.get("regions"), list):
            raise ValueError("snapshot needs rect, regions and shapes")
        if len(json.dumps(value, ensure_ascii=False).encode()) > MAX_SNAPSHOT_BYTES:
            raise ValueError("snapshot is too large")
        return value


class Participant(BaseModel):
    user_id: str
    name: str
    at: str


class OperationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    date: date
    note: str
    report_ids: list[str]
    participants: list[Participant]
    has_snapshot: bool
    author_id: str
    author_name: str
    created_at: datetime
    can_edit: bool = False


class OperationRead(OperationSummary):
    snapshot: dict[str, Any] | None


class OperationList(BaseModel):
    can_create: bool
    operations: list[OperationSummary]


class Attend(BaseModel):
    model_config = ConfigDict(extra="forbid")

    going: bool
