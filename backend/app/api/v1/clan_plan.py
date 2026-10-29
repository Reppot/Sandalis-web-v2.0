"""Общий план клана в «Планировании» (/clan/plan): объекты на карте, которые офицеры рисуют
вместе. Правки приходят операциями (добавить/изменить объекты, удалить, очистить) — так
одновременные правки разных объектов не затирают друг друга. Клиенты опрашивают GET ?since=версия.
Читают участники с operations:read, правят — с operations:create."""
from __future__ import annotations

import json
import math
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentPrincipal, DbDep, PermissionChecker
from app.core.errors import AppError, NotFoundError
from app.core.permissions import Scopes
from app.core.security import Principal
from app.models.clan_plan import ClanPlan

router = APIRouter(prefix="/clan/plan", tags=["clan"])
CanRead = [Depends(PermissionChecker([Scopes.OPERATIONS_READ]))]

KINDS = frozenset({"line", "ruler", "arrow", "radius", "structure", "order", "point"})
MAX_SHAPES = 2000
MAX_BYTES = 1_500_000


class PlanState(BaseModel):
    version: int
    shapes: list[dict[str, Any]] | None = None      # None — с версии since ничего не менялось
    updated_by_name: str = ""
    updated_at: datetime | None = None
    can_edit: bool = False


class PlanOps(BaseModel):
    model_config = ConfigDict(extra="forbid")

    upsert: Annotated[list[dict[str, Any]], Field(max_length=300)] = Field(default_factory=list)
    delete: Annotated[list[Annotated[str, Field(max_length=24)]], Field(max_length=300)] = Field(default_factory=list)
    clear: bool = False


def _member(principal: Principal) -> bool:
    return principal.subject_type == "user"


def _can_edit(principal: Principal) -> bool:
    return _member(principal) and principal.can(Scopes.OPERATIONS_CREATE)


def _valid(shape: dict[str, Any]) -> bool:
    sid = shape.get("id")
    if not isinstance(sid, str) or not 0 < len(sid) <= 24 or shape.get("kind") not in KINDS:
        return False
    return all(isinstance(shape.get(k), (int, float)) and math.isfinite(shape[k]) for k in ("x", "y"))


def _state(row: ClanPlan | None, principal: Principal, since: int | None = None) -> PlanState:
    if row is None:
        return PlanState(version=0, shapes=None if since == 0 else [], can_edit=_can_edit(principal))
    return PlanState(version=row.version, shapes=None if since == row.version else list(row.shapes or []),
                     updated_by_name=row.updated_by_name, updated_at=row.updated_at, can_edit=_can_edit(principal))


@router.get("", response_model=PlanState, summary="Общий план клана (since — версия, которая уже есть у клиента)", dependencies=CanRead)
async def read_plan(principal: CurrentPrincipal, session: DbDep, since: Annotated[int | None, Query(ge=0)] = None) -> PlanState:
    if not _member(principal):
        return PlanState(version=0, shapes=[])
    row = (await session.execute(select(ClanPlan))).scalar_one_or_none()
    return _state(row, principal, since)


@router.post("/ops", response_model=PlanState, summary="Правки общего плана: добавить/изменить, удалить, очистить")
async def apply_ops(payload: PlanOps, principal: CurrentPrincipal, session: DbDep) -> PlanState:
    if not _member(principal):
        raise NotFoundError()
    if not _can_edit(principal):
        raise AppError(message_key="errors.plan_forbidden", code="forbidden", status_code=403, params={})
    if not all(_valid(s) for s in payload.upsert):
        raise AppError(message_key="errors.plan_invalid", code="validation_error", status_code=422, params={})
    for attempt in range(2):
        row = (await session.execute(select(ClanPlan).with_for_update())).scalar_one_or_none()
        if row is not None:
            break
        session.add(ClanPlan(shapes=[], version=0, updated_by_name=""))
        try:
            await session.commit()
        except IntegrityError:          # план создал соседний запрос — читаем его
            await session.rollback()
    assert row is not None
    shapes: list[dict[str, Any]] = [] if payload.clear else list(row.shapes or [])
    gone = set(payload.delete)
    by_id = {s["id"]: s for s in payload.upsert}
    # изменённые — на своих местах (порядок рисования), новые — в конец
    out = [by_id.pop(s.get("id"), s) for s in shapes if s.get("id") not in gone]
    out += [s for s in by_id.values() if s["id"] not in gone]
    if len(out) > MAX_SHAPES or len(json.dumps(out, ensure_ascii=False).encode()) > MAX_BYTES:
        raise AppError(message_key="errors.plan_too_large", code="validation_error", status_code=422, params={"n": MAX_SHAPES})
    row.shapes = out
    row.version = (row.version or 0) + 1
    row.updated_by_name = (principal.display_name or principal.user_id)[:120]
    await session.commit()
    await session.refresh(row)
    return _state(row, principal)
