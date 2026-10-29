"""Операции клана (/clan/operations): календарь, снимки карты из «Планирования», заказы
на снимке и опрос «отметьтесь участником». Читают участники клана (гостю — пусто); создают
те, кто может оформлять заказы (reports:create); править и удалять — автор или clan:content."""
from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, Response, UploadFile, status
from sqlalchemy import select

from app.api.deps import CurrentPrincipal, DbDep, PermissionChecker
from app.core.errors import AppError, NotFoundError
from app.core.permissions import Scopes
from app.core.security import Principal
from app.models.operation import ClanOperation
from app.models.rbac import ClanMembership, User
from app.schemas.operation import (
    MAX_SNAPSHOTS,
    Assign,
    Attend,
    Debrief,
    OperationCreate,
    OperationList,
    OperationRead,
    OperationSummary,
    OperationWrite,
    PlanWrite,
    SnapshotsAdd,
    StageDone,
)
from app.services import discord_ops, operation_plan
from app.services.mentions import clan_roles, deliver, mentioned

router = APIRouter(prefix="/clan/operations", tags=["clan"])
CanRead = [Depends(PermissionChecker([Scopes.OPERATIONS_READ]))]
CanCreate = [Depends(PermissionChecker([Scopes.OPERATIONS_CREATE]))]
CanAttend = [Depends(PermissionChecker([Scopes.OPERATIONS_ATTEND]))]

MAX_OPERATIONS = 500
MAX_BRIEF_IMAGES = 6
MAX_IMAGE_BYTES = 8 * 1024 * 1024     # лимит вложения Discord без Nitro


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
        id=row.id, title=row.title, date=row.date, note=row.note, starts_at=row.starts_at, report_ids=row.report_ids or [],
        participants=operation_plan.people(row), plan=operation_plan.plan_of(row), snapshot_names=[s.get("name") or "" for s in row.snapshots or []], author_id=row.author_id,
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
    answered = {p["user_id"] for p in operation_plan.people(row)}
    members = (await session.execute(
        select(ClanMembership.user_id, User.display_name).join(User, User.id == ClanMembership.user_id)
        .where(ClanMembership.is_active.is_(True)).limit(500)
    )).all()
    silent = sorted(({"user_id": uid, "name": name or uid} for uid, name in members if uid not in answered),
                    key=lambda m: m["name"].lower())[:200]
    return OperationRead(**_summary(row, principal).model_dump(), snapshots=row.snapshots or [],
                         supply=await operation_plan.supply(session, row), silent=silent)


@router.post("", response_model=OperationSummary, status_code=status.HTTP_201_CREATED, dependencies=CanCreate,
             summary="Новая операция (из снимка «Планирования» или просто дата)")
async def create_operation(payload: OperationCreate, principal: CurrentPrincipal, session: DbDep,
                           background: BackgroundTasks) -> OperationSummary:
    if not _member(principal):
        raise NotFoundError()
    count = len((await session.execute(select(ClanOperation.id))).all())
    if count >= MAX_OPERATIONS:
        raise AppError(message_key="errors.operations_too_many", code="validation_error", status_code=422,
                       params={"n": MAX_OPERATIONS})
    row = ClanOperation(
        title=payload.title, date=payload.date, note=payload.note, snapshots=payload.snapshots, starts_at=payload.starts_at,
        report_ids=_report_ids(payload.snapshots), participants=[],
        author_id=principal.user_id, author_name=(principal.display_name or principal.user_id)[:120],
    )
    operation_plan.sync_points(row)
    session.add(row)
    await session.flush()
    await _notify(session, principal, row, mentioned(row.note, await clan_roles(session)))
    await session.commit()
    await session.refresh(row)
    background.add_task(discord_ops.sync, row.id)
    return _summary(row, principal)


@router.put("/{operation_id}", response_model=OperationSummary, summary="Переименовать / перенести операцию")
async def update_operation(operation_id: uuid.UUID, payload: OperationWrite, principal: CurrentPrincipal, session: DbDep,
                           background: BackgroundTasks) -> OperationSummary:
    row = await _get(session, operation_id)
    if not _can_edit(principal, row):
        raise AppError(message_key="errors.operation_not_yours", code="forbidden", status_code=403, params={})
    roles = await clan_roles(session)
    before = {r["id"] for r in mentioned(row.note, roles)}
    moved = row.date != payload.date
    row.title, row.date, row.note = payload.title, payload.date, payload.note
    if row.starts_at != payload.starts_at or moved:
        row.reminded = False          # новое время — напомним заново
        row.rsvp_asked = False
    row.starts_at = payload.starts_at
    # письма — только ролям, которых в заметке раньше не было
    await _notify(session, principal, row, [r for r in mentioned(row.note, roles) if r["id"] not in before])
    await session.commit()
    await session.refresh(row)
    background.add_task(discord_ops.sync, row.id)
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
    operation_plan.sync_points(row)
    await session.commit()
    await session.refresh(row)
    return _summary(row, principal)


@router.delete("/{operation_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить операцию")
async def delete_operation(operation_id: uuid.UUID, principal: CurrentPrincipal, session: DbDep,
                           background: BackgroundTasks) -> Response:
    row = await _get(session, operation_id)
    if not _can_edit(principal, row):
        raise AppError(message_key="errors.operation_not_yours", code="forbidden", status_code=403, params={})
    posted = discord_ops.ids_of(row)
    await session.delete(row)
    await session.commit()
    background.add_task(discord_ops.remove, row.clan_id, posted)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{operation_id}/attend", response_model=OperationSummary, summary="Отметиться участником операции",
             dependencies=CanAttend)
async def attend_operation(operation_id: uuid.UUID, payload: Attend, principal: CurrentPrincipal, session: DbDep,
                           background: BackgroundTasks) -> OperationSummary:
    if not _member(principal):
        raise NotFoundError()
    row = await _get(session, operation_id)
    # новый список участников — JSONB помечается изменённым
    operation_plan.answer(row, principal.user_id, principal.display_name or principal.user_id, payload.resolved(), payload.role)
    await session.commit()
    await session.refresh(row)
    background.add_task(discord_ops.sync, row.id)
    return _summary(row, principal)


def _editor(principal: Principal, row: ClanOperation) -> None:
    if not _can_edit(principal, row):
        raise AppError(message_key="errors.operation_not_yours", code="forbidden", status_code=403, params={})


@router.put("/{operation_id}/plan", response_model=OperationSummary, summary="План операции: роли, отряды, этапы, точки")
async def save_plan(operation_id: uuid.UUID, payload: PlanWrite, principal: CurrentPrincipal, session: DbDep,
                    background: BackgroundTasks) -> OperationSummary:
    row = await _get(session, operation_id)
    _editor(principal, row)
    plan = operation_plan.plan_of(row)
    row.plan = {**payload.model_dump(mode="json", exclude={"points"}), "points": (row.plan or {}).get("points") or [],
                "debrief": plan.debrief.model_dump(mode="json")}
    # точки — со снимков «Планирования»; из плана берём только «в брифинге»
    operation_plan.sync_points(row, {p.id: p.brief for p in payload.points})
    operation_plan.clean_refs(row, operation_plan.plan_of(row))
    await session.commit()
    await session.refresh(row)
    background.add_task(discord_ops.sync, row.id)
    return _summary(row, principal)


@router.put("/{operation_id}/debrief", response_model=OperationSummary, summary="Итоги операции")
async def save_debrief(operation_id: uuid.UUID, payload: Debrief, principal: CurrentPrincipal, session: DbDep) -> OperationSummary:
    row = await _get(session, operation_id)
    _editor(principal, row)
    row.plan = {**(row.plan or {}), "debrief": payload.model_dump(mode="json")}
    await session.commit()
    await session.refresh(row)
    return _summary(row, principal)


@router.post("/{operation_id}/assign", response_model=OperationSummary, summary="Роль, отряд и явка участника")
async def assign_member(operation_id: uuid.UUID, payload: Assign, principal: CurrentPrincipal, session: DbDep,
                        background: BackgroundTasks) -> OperationSummary:
    row = await _get(session, operation_id)
    _editor(principal, row)
    fields = payload.model_dump(include=payload.model_fields_set - {"user_id"})
    if not operation_plan.assign(row, payload.user_id, fields):
        raise NotFoundError()
    await session.commit()
    await session.refresh(row)
    background.add_task(discord_ops.sync, row.id)
    return _summary(row, principal)


@router.post("/{operation_id}/stages/{stage_id}", response_model=OperationSummary, summary="Отметить этап выполненным")
async def stage_done(operation_id: uuid.UUID, stage_id: str, payload: StageDone, principal: CurrentPrincipal,
                     session: DbDep) -> OperationSummary:
    row = await _get(session, operation_id)
    plan = operation_plan.plan_of(row)
    stage = next((st for st in plan.stages if st.id == stage_id), None)
    if stage is None:
        raise NotFoundError()
    # этап отмечает командир операции или ответственный за этап
    if not (_can_edit(principal, row) or (_member(principal) and stage.owner_id == principal.user_id)):
        raise AppError(message_key="errors.operation_not_yours", code="forbidden", status_code=403, params={})
    stage.done = payload.done
    row.plan = plan.model_dump(mode="json")
    await session.commit()
    await session.refresh(row)
    return _summary(row, principal)


@router.post("/{operation_id}/brief", summary="Отправить брифинг в ветку операции в Discord",
             description="Текст брифинга (без скрытого) и, по желанию, PNG снимков карты (сформированы клиентом).")
async def post_brief(
    operation_id: uuid.UUID,
    principal: CurrentPrincipal,
    session: DbDep,
    images: Annotated[list[UploadFile] | None, File(description="PNG снимков карты операции")] = None,
) -> dict[str, bool]:
    row = await _get(session, operation_id)
    _editor(principal, row)
    files: list[tuple[str, bytes]] = []
    for i, image in enumerate((images or [])[:MAX_BRIEF_IMAGES]):
        data = await image.read(MAX_IMAGE_BYTES + 1)
        if len(data) > MAX_IMAGE_BYTES:
            raise AppError(message_key="report.image_too_large", domain="reports", code="too_large", status_code=413,
                           params={"limit_mb": 8})
        if data:
            files.append((f"map-{i + 1}.png", data))
    return {"posted": await discord_ops.post_brief(session, row, files)}
