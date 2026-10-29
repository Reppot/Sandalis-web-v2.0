from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from typing import Annotated, Any, Literal

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


Status = Literal["go", "maybe", "no"]
Outcome = Literal["success", "partial", "fail"]
PointKind = Literal["target", "rally", "supply", "retreat", "other"]
# разделы брифинга, которые командир может скрыть
Section = Literal["note", "stages", "points", "roles", "squads", "people", "supply", "maps"]
Key = Annotated[str, Field(min_length=1, max_length=24, pattern=r"^[A-Za-z0-9_-]+$")]
Short = Annotated[str, Field(max_length=300)]


class Participant(BaseModel):
    user_id: str
    name: str
    at: str
    status: Status = "go"               # старые записи — «иду»
    role: str | None = None
    squad: str | None = None
    attended: bool | None = None        # явка после операции: None — не отмечали


class _Item(BaseModel):
    model_config = ConfigDict(extra="ignore")


class PlanRole(_Item):
    id: Key
    name: Annotated[str, Field(min_length=1, max_length=40)]
    slots: Annotated[int, Field(ge=0, le=100)] = 0     # 0 — без ограничения


class PlanSquad(_Item):
    id: Key
    name: Annotated[str, Field(min_length=1, max_length=40)]
    leader_id: str | None = None


class PlanStage(_Item):
    id: Key
    time: Annotated[str, Field(pattern=r"^$|^([01]\d|2[0-3]):[0-5]\d$")] = ""
    title: Annotated[str, Field(min_length=1, max_length=120)]
    note: Short = ""
    owner_id: str | None = None
    done: bool = False
    brief: bool = True                   # показывать этап в брифинге


class PlanPoint(_Item):
    """Точка из «Планирования»: приходит со снимком карты (метка «Точка»); командир решает только,
    показывать ли её в брифинге."""
    id: Key
    kind: PointKind = "target"
    label: Annotated[str, Field(max_length=80)] = ""
    note: Short = ""
    brief: bool = True
    snapshot: int | None = None          # номер снимка операции, где стоит точка


class Debrief(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcome: Outcome | None = None
    text: Annotated[str, Field(max_length=2000)] = ""


class PlanWrite(BaseModel):
    """План операции целиком (итоги — отдельно)."""
    model_config = ConfigDict(extra="forbid")

    roles: Annotated[list[PlanRole], Field(max_length=12)] = Field(default_factory=list)
    squads: Annotated[list[PlanSquad], Field(max_length=12)] = Field(default_factory=list)
    stages: Annotated[list[PlanStage], Field(max_length=40)] = Field(default_factory=list)
    points: Annotated[list[PlanPoint], Field(max_length=30)] = Field(default_factory=list)
    hidden: list[Section] = Field(default_factory=list)

    @field_validator("roles", "squads", "stages", "points")
    @classmethod
    def _unique(cls, value: list[Any]) -> list[Any]:
        if len({x.id for x in value}) != len(value):
            raise ValueError("duplicate id")
        return value


class Plan(PlanWrite):
    model_config = ConfigDict(extra="ignore")

    debrief: Debrief = Field(default_factory=Debrief)


class SupplyRow(BaseModel):
    report_id: str
    title: str
    status: str
    delivered: int
    ordered: int


class Member(BaseModel):
    user_id: str
    name: str


class OperationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    date: date
    note: str
    starts_at: datetime | None = None
    report_ids: list[str]
    participants: list[Participant]
    plan: Plan = Field(default_factory=Plan)
    snapshot_names: list[str]          # названия снимков карты (пусто — операция без карты)
    author_id: str
    author_name: str
    created_at: datetime
    can_edit: bool = False


class OperationRead(OperationSummary):
    snapshots: list[dict[str, Any]]
    supply: list[SupplyRow] = Field(default_factory=list)      # заказы к операции: привезено / заказано
    silent: list[Member] = Field(default_factory=list)         # участники терминала, не ответившие на опрос


class OperationList(BaseModel):
    can_create: bool
    operations: list[OperationSummary]


class Attend(BaseModel):
    """Ответ на опрос: status (go / maybe / no) и роль; без status — снять ответ.
    going — старая форма (true — «иду», false — снять)."""
    model_config = ConfigDict(extra="forbid")

    status: Status | None = None
    going: bool | None = None
    role: str | None = None

    def resolved(self) -> Status | None:
        if self.status is not None:
            return self.status
        return "go" if self.going else None


class Assign(BaseModel):
    """Командир: роль, отряд и явка участника (переданные поля)."""
    model_config = ConfigDict(extra="forbid")

    user_id: Annotated[str, Field(min_length=1, max_length=64)]
    role: str | None = None
    squad: str | None = None
    attended: bool | None = None


class StageDone(BaseModel):
    model_config = ConfigDict(extra="forbid")

    done: bool
