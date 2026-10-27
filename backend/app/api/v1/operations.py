"""Операции клана (/clan/operations): календарь, снимки карты из «Планирования», заказы
на снимке и опрос «отметьтесь участником». Читают участники клана (гостю — пусто); создают
те, кто может оформлять заказы (reports:create); править и удалять — автор или clan:content."""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import select

from app.api.deps import CurrentPrincipal, DbDep, PermissionChecker
from app.core.errors import AppError, NotFoundError
from app.core.permissions import Scopes
from app.core.security import Principal
from app.models.operation import ClanOperation
from app.schemas.operation import MAX_SNAPSHOTS, Attend, OperationCreate, OperationList, OperationRead, OperationSummary, OperationWrite, SnapshotsAdd
from app.services.mentions import clan_roles, deliver, mentioned

router = APIRouter(prefix="/clan/operations", tags=["clan"])
CanRead = [Depends(PermissionChecker([Scopes.OPERATIONS_READ]))]
CanCreate = [Depends(PermissionChecker([Scopes.OPERATIONS_CREATE]))]
CanAttend = [Depends(PermissionChecker([Scopes.OPERATIONS_ATTEND]))]

MAX_OPERATIONS = 500


def _member(principal: Principal) -> bool:
    return principal.subject_type == "user"


def _can_edit(principal: Principal, row: ClanOperation) -> bool:
    return _member(principal) and (row.author_id == principal.user_id or principal.can(Scopes.OPERATIONS_MANAGE))


def _report_ids(snapshots: list[dict[str, Any]]) -> list[str]:
    """Заказы, отмеченные на снимках метками «Заказ»."""
    ids: list[str] = []
    for snap in snapshots:
        for shape in snap.get("shapes") or []:
            rid = shape.get("report") if isinstance(shape, dict) and shape.get("kind") == "order" else None
            if isinstance(rid, str) and rid[:64] not in ids:
                ids.append(rid[:64])
    return ids


async def _notify(session: DbDep, principal: Principal, row: ClanOperation, roles: list[dict[str, Any]]) -> None:
    """Письма в почту сайта тем, чьи роли упомянуты в заметке («@роль»); @everyone — только с правом."""
    if not principal.can(Scopes.CLAN_EVERYONE):
        roles = [r for r in roles if r["id"] != "everyone"]
    await deliver(
        session, clan_id=principal.clan_id, roles=roles, sender_id=principal.user_id,
        sender_name=principal.display_name or principal.user_id, kind="operation_mention",
        payload={"operation_id": str(row.id), "title": row.title, "date": row.date.isoformat(), "note": row.note[:500]},
    )


def _summary(row: ClanOperation, principal: Principal) -> OperationSummary:
    return OperationSummary(
        id=row.id, title=row.title, date=row.date, note=row.note, report_ids=row.report_ids or [],
        participants=row.participants or [], snapshot_names=[s.get("name") or "" for s in row.snapshots or []], author_id=row.author_id,
        author_name=row.author_name, created_at=row.created_at, can_edit=_can_edit(principal, row),
    )


async def _get(session: DbDep, operation_id: uuid.UUID) -> ClanOperation:
    row = (await session.execute(select(ClanOperation).where(ClanOperation.id == operation_id))).scalar_one_or_none()
    if row is None:
        raise NotFoundError()
    return row


@router.get("", response_model=OperationList, summary="Операции клана (календарь)", dependencies=CanRead)
async def list_operations(
    principal: CurrentPrincipal,
    session: DbDep,
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
) -> OperationList:
    if not _member(principal):
        return OperationList(can_create=False, operations=[])
    query = select(ClanOperation).order_by(ClanOperation.date, ClanOperation.created_at)
    if start:
        query = query.where(ClanOperation.date >= start)
    if end:
        query = query.where(ClanOperation.date <= end)
    rows = (await session.execute(query)).scalars().all()
    return OperationList(can_create=principal.can(Scopes.OPERATIONS_CREATE), operations=[_summary(r, principal) for r in rows])


@router.get("/{operation_id}", response_model=OperationRead, summary="Операция со снимком карты", dependencies=CanRead)
async def read_operation(operation_id: uuid.UUID, principal: CurrentPrincipal, session: DbDep) -> OperationRead:
    if not _member(principal):
        raise NotFoundError()
    row = await _get(session, operation_id)
    return OperationRead(**_summary(row, principal).model_dump(), snapshots=row.snapshots or [])


@router.post("", response_model=OperationSummary, status_code=status.HTTP_201_CREATED, dependencies=CanCreate,
             summary="Новая операция (из снимка «Планирования» или просто дата)")
async def create_operation(payload: OperationCreate, principal: CurrentPrincipal, session: DbDep) -> OperationSummary:
    if not _member(principal):
        raise NotFoundError()
    count = len((await session.execute(select(ClanOperation.id))).all())
    if count >= MAX_OPERATIONS:
        raise AppError(message_key="errors.operations_too_many", code="validation_error", status_code=422,
                       params={"n": MAX_OPERATIONS})
    row = ClanOperation(
        title=payload.title, date=payload.date, note=payload.note, snapshots=payload.snapshots,
        report_ids=_report_ids(payload.snapshots), participants=[],
        author_id=principal.user_id, author_name=(principal.display_name or principal.user_id)[:120],
    )
    session.add(row)
    await session.flush()
    await _notify(session, principal, row, mentioned(row.note, await clan_roles(session)))
    await session.commit()
    await session.refresh(row)
    return _summary(row, principal)


@router.put("/{operation_id}", response_model=OperationSummary, summary="Переименовать / перенести операцию")
async def update_operation(operation_id: uuid.UUID, payload: OperationWrite, principal: CurrentPrincipal, session: DbDep) -> OperationSummary:
    row = await _get(session, operation_id)
    if not _can_edit(principal, row):
        raise AppError(message_key="errors.operation_not_yours", code="forbidden", status_code=403, params={})
    roles = await clan_roles(session)
    before = {r["id"] for r in mentioned(row.note, roles)}
    row.title, row.date, row.note = payload.title, payload.date, payload.note
    # письма — только ролям, которых в заметке раньше не было
    await _notify(session, principal, row, [r for r in mentioned(row.note, roles) if r["id"] not in before])
    await session.commit()
    await session.refresh(row)
    return _summary(row, principal)


@router.post("/{operation_id}/snapshots", response_model=OperationSummary, summary="Добавить снимки карты в операцию")
async def add_snapshots(operation_id: uuid.UUID, payload: SnapshotsAdd, principal: CurrentPrincipal, session: DbDep) -> OperationSummary:
    row = await _get(session, operation_id)
    if not _can_edit(principal, row):
        raise AppError(message_key="errors.operation_not_yours", code="forbidden", status_code=403, params={})
    snapshots = [*(row.snapshots or []), *payload.snapshots]
    if len(snapshots) > MAX_SNAPSHOTS:
        raise AppError(message_key="errors.operation_snapshots_too_many", code="validation_error", status_code=422,
                       params={"n": MAX_SNAPSHOTS})
    row.snapshots = snapshots
    row.report_ids = _report_ids(snapshots)
    await session.commit()
    await session.refresh(row)
    return _summary(row, principal)


@router.delete("/{operation_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить операцию")
async def delete_operation(operation_id: uuid.UUID, principal: CurrentPrincipal, session: DbDep) -> Response:
    row = await _get(session, operation_id)
    if not _can_edit(principal, row):
        raise AppError(message_key="errors.operation_not_yours", code="forbidden", status_code=403, params={})
    await session.delete(row)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{operation_id}/attend", response_model=OperationSummary, summary="Отметиться участником операции",
             dependencies=CanAttend)
async def attend_operation(operation_id: uuid.UUID, payload: Attend, principal: CurrentPrincipal, session: DbDep) -> OperationSummary:
    if not _member(principal):
        raise NotFoundError()
    row = await _get(session, operation_id)
    people = [p for p in (row.participants or []) if p.get("user_id") != principal.user_id]
    if payload.going:
        people.append({"user_id": principal.user_id, "name": (principal.display_name or principal.user_id)[:120],
                       "at": datetime.now(UTC).isoformat()})
    row.participants = people  # новый список — JSONB помечается изменённым
    await session.commit()
    await session.refresh(row)
    return _summary(row, principal)
