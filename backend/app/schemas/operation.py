from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

# снимок карты небольшой (кусок гексов + объекты плана), но ограничим, чтобы не раздувать базу
MAX_SNAPSHOT_BYTES = 400_000
MAX_SNAPSHOTS = 20


def check_snapshots(value: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(value) > MAX_SNAPSHOTS:
        raise ValueError("too many snapshots")
    for snap in value:
        if not isinstance(snap.get("rect"), dict) or not isinstance(snap.get("shapes"), list) or not isinstance(snap.get("regions"), list):
            raise ValueError("snapshot needs rect, regions and shapes")
        if len(json.dumps(snap, ensure_ascii=False).encode()) > MAX_SNAPSHOT_BYTES:
            raise ValueError("snapshot is too large")
        snap["name"] = str(snap.get("name") or "")[:60]
    return value


class OperationWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Annotated[str, Field(min_length=1, max_length=120)]
    date: date
    note: Annotated[str, Field(max_length=1000)] = ""
    starts_at: datetime | None = None      # время начала с часовым поясом автора

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
    snapshots: list[dict[str, Any]] = Field(default_factory=list)

    @field_validator("snapshots")
    @classmethod
    def _snapshots(cls, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return check_snapshots(value)


class SnapshotsAdd(BaseModel):
    """Добавить снимки «Планирования» в уже созданную операцию."""
    model_config = ConfigDict(extra="forbid")

    snapshots: Annotated[list[dict[str, Any]], Field(min_length=1)]

    @field_validator("snapshots")
    @classmethod
    def _snapshots(cls, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return check_snapshots(value)


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
    starts_at: datetime | None = None
    report_ids: list[str]
    participants: list[Participant]
    snapshot_names: list[str]          # названия снимков карты (пусто — операция без карты)
    author_id: str
    author_name: str
    created_at: datetime
    can_edit: bool = False


class OperationRead(OperationSummary):
    snapshots: list[dict[str, Any]]


class OperationList(BaseModel):
    can_create: bool
    operations: list[OperationSummary]


class Attend(BaseModel):
    model_config = ConfigDict(extra="forbid")

    going: bool
