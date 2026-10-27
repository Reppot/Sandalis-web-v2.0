from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Sequence

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from sqlalchemy import select

from app.api.deps import (
    ClanSession,
    CurrentPrincipal,
    PermissionChecker,
    domain_translator,
)
from app.core.errors import AppError, NotFoundError
from app.core.i18n import Translator
from app.core.permissions import Scopes
from app.core.security import Principal
from app.models.report import OrderReport, ReportStatus
from app.schemas.clan_settings import ClanSettingsRead, ClanSettingsSaved, ClanSettingsUpdate
from app.schemas.common import Page
from app.schemas.report import (
    Assignee,
    ContributionCreate,
    DiscordSent,
    ReportComment,
    ReportCreate,
    ReportEventRead,
    ReportLineRead,
    ReportProgressRead,
    ReportRead,
    ReportSaved,
    ReportStatusUpdate,
    ReportTake,
    ReportTaskUpdate,
    ReportUpdate,
)
from app.services.clan_settings import ClanSettingsService, to_read
from app.services.report_progress import ReportProgressService
from app.services import report_tasks
from app.services.reports import CatalogNames, ReportService, line_icon, line_names

router = APIRouter(prefix="/reports", tags=["reports"])
settings_router = APIRouter(prefix="/clan", tags=["clan"])

ReportsTranslator = Annotated[Translator, Depends(domain_translator("reports"))]
MAX_IMAGE_BYTES = 8 * 1024 * 1024     # лимит вложения Discord без Nitro


async def get_report_service(
    session: ClanSession, principal: CurrentPrincipal, translator: ReportsTranslator
) -> ReportService:
    return ReportService(session, principal, translator)


async def get_settings_service(
    session: ClanSession, principal: CurrentPrincipal, translator: ReportsTranslator
) -> ClanSettingsService:
    return ClanSettingsService(session, principal, translator)


ServiceDep = Annotated[ReportService, Depends(get_report_service)]
SettingsServiceDep = Annotated[ClanSettingsService, Depends(get_settings_service)]


def _who(principal: Principal) -> tuple[str, str]:
    return principal.user_id, (principal.display_name or principal.user_id)


def _read(report: OrderReport, icons: dict[str, str | None], names: CatalogNames,
          delivered: dict[uuid.UUID, int] | None = None, contributors: dict[uuid.UUID, list[str]] | None = None) -> ReportRead:
    lines = [
        ReportLineRead.model_validate(line).model_copy(
            update={"icon_url": line_icon(icons, line.item_code, line.name), **line_names(names, line.item_code)}
        )
        for line in report.lines
    ]
    read = ReportRead.model_validate(report)
    return read.model_copy(update={
        "lines": lines,
        "lines_count": len(lines),
        "total_quantity": sum(line.quantity for line in lines),
        "delivered_total": (delivered or {}).get(report.id, 0),
        "contributor_ids": (contributors or {}).get(report.id, []),
    })


async def _one(service: ReportService, report: OrderReport) -> ReportRead:
    delivered, contributors = await report_tasks.progress_for(service.session, [report])
    return _read(report, await service.icons_for([report]), await service.names_for([report]), delivered, contributors)


async def _many(service: ReportService, reports: Sequence[OrderReport]) -> list[ReportRead]:
    icons, names = await service.icons_for(reports), await service.names_for(reports)
    delivered, contributors = await report_tasks.progress_for(service.session, reports)
    return [_read(r, icons, names, delivered, contributors) for r in reports]


@router.get(
    "/assignees",
    response_model=list[Assignee],
    summary="Участники клана, которых можно назначить исполнителями",
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_READ]))],
)
async def list_assignees(service: ServiceDep) -> list[Assignee]:
    return [Assignee(**m) for m in await report_tasks.members(service.session)]


@router.patch(
    "/{report_id}/task",
    response_model=ReportRead,
    summary="Поля задачи: исполнители, приоритет, срок, теги, операция",
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_STATUS]))],
)
async def update_task(report_id: uuid.UUID, payload: ReportTaskUpdate, service: ServiceDep, principal: CurrentPrincipal) -> ReportRead:
    report = await service.get_report(report_id, for_update=True)
    fields = payload.model_fields_set
    actor, actor_name = _who(principal)
    ev = lambda kind, **kw: report_tasks.log(service.session, report.id, kind, actor, actor_name, **kw)  # noqa: E731
    if "priority" in fields and payload.priority and payload.priority != report.priority:
        ev("priority", value=payload.priority)
        report.priority = payload.priority
    if "due_date" in fields and payload.due_date != report.due_date:
        ev("due", value=payload.due_date.isoformat() if payload.due_date else None)
        report.due_date = payload.due_date
    if "tags" in fields and payload.tags is not None:
        clean: list[str] = []
        for tag in payload.tags:
            tag = tag.strip().lstrip("#").strip().lower()[:24]
            if tag and tag not in clean:
                clean.append(tag)
        if clean != list(report.tags or []):
            ev("tags", value=clean)
        report.tags = clean
    if "operation_id" in fields:
        if payload.operation_id and not await report_tasks.operation_exists(service.session, payload.operation_id):
            raise NotFoundError()
        if payload.operation_id != report.operation_id:
            ev("operation", value=str(payload.operation_id) if payload.operation_id else None)
        report.operation_id = payload.operation_id
    if "assignees" in fields and payload.assignees is not None:
        known = {m["user_id"]: m["name"] for m in await report_tasks.members(service.session)}
        wanted = [uid for uid in dict.fromkeys(payload.assignees) if uid in known]
        before = {a.get("user_id") for a in report.assignees or []}
        for uid in wanted:
            if uid not in before:
                ev("assigned", name=known[uid])
        for a in report.assignees or []:
            if a.get("user_id") not in wanted:
                ev("unassigned", name=a.get("name"))
        report.assignees = [{"user_id": uid, "name": known[uid]} for uid in wanted]
        report_tasks.notify_assigned(
            service.session, clan_id=principal.clan_id, report=report,
            new_ids=[uid for uid in wanted if uid not in before],
            sender_id=principal.user_id, sender_name=principal.display_name or principal.user_id,
        )
    await service.session.commit()
    return await _one(service, await service.get_report(report_id))


@router.post(
    "/{report_id}/take",
    response_model=ReportRead,
    summary="Взять заказ себе / отказаться (любой, кто видит заказы)",
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_READ]))],
)
async def take_task(report_id: uuid.UUID, payload: ReportTake, service: ServiceDep, principal: CurrentPrincipal) -> ReportRead:
    if principal.subject_type != "user":
        raise NotFoundError()
    report = await service.get_report(report_id, for_update=True)
    people = [a for a in report.assignees or [] if a.get("user_id") != principal.user_id]
    if payload.take:
        people.append({"user_id": principal.user_id, "name": (principal.display_name or principal.user_id)[:120]})
    was = any(a.get("user_id") == principal.user_id for a in report.assignees or [])
    if was != payload.take:
        report_tasks.log(service.session, report.id, "take" if payload.take else "drop", *_who(principal))
    report.assignees = people
    await service.session.commit()
    return await _one(service, await service.get_report(report_id))


@router.get(
    "/{report_id}/events",
    response_model=list[ReportEventRead],
    summary="Лента заказа: события и комментарии (новые первыми)",
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_READ]))],
)
async def report_events(report_id: uuid.UUID, service: ServiceDep) -> list[ReportEventRead]:
    await service.get_report(report_id)
    return [ReportEventRead.model_validate(e) for e in await report_tasks.events(service.session, report_id)]


@router.post(
    "/{report_id}/comments",
    response_model=ReportEventRead,
    status_code=status.HTTP_201_CREATED,
    summary="Комментарий к заказу; @роль и @участник получают письмо в почту сайта",
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_READ]))],
)
async def add_comment(report_id: uuid.UUID, payload: ReportComment, service: ServiceDep, principal: CurrentPrincipal) -> ReportEventRead:
    if principal.subject_type != "user":
        raise NotFoundError()
    report = await service.get_report(report_id)
    actor, actor_name = _who(principal)
    recipients, mentions = await report_tasks.comment_recipients(service.session, payload.text, actor)
    report_tasks.log(service.session, report.id, "comment", actor, actor_name, text=payload.text, mentions=mentions or None)
    report_tasks.mail(service.session, clan_id=principal.clan_id, recipients=recipients, sender_id=actor, sender_name=actor_name,
                      kind="order_comment", payload={"report_id": str(report.id), "title": report.title, "text": payload.text[:500]})
    await service.session.commit()
    [latest] = await report_tasks.events(service.session, report.id, limit=1)
    return ReportEventRead.model_validate(latest)


@router.get(
    "",
    response_model=Page[ReportRead],
    summary="Текущие заказы клана: рапорты снабжения (новые первыми)",
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_READ]))],
)
async def list_reports(
    service: ServiceDep,
    principal: CurrentPrincipal,
    status_filter: Annotated[list[ReportStatus] | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[ReportRead]:
    if principal.subject_type == "user" and await report_tasks.remind_due(service.session, principal.clan_id, date.today()):
        await service.session.commit()
    rows, total = await service.list_reports(statuses=status_filter, limit=limit, offset=offset)
    return Page[ReportRead](
        items=await _many(service, rows), total=total, limit=limit, offset=offset
    )


@router.get(
    "/{report_id}",
    response_model=ReportRead,
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_READ]))],
)
async def get_report(report_id: uuid.UUID, service: ServiceDep) -> ReportRead:
    return await _one(service, await service.get_report(report_id))


@router.post(
    "",
    response_model=ReportSaved,
    status_code=status.HTTP_201_CREATED,
    summary="Отправить рапорт в штаб (строки без кода резолвятся по названию)",
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_CREATE]))],
)
async def create_report(payload: ReportCreate, service: ServiceDep, principal: CurrentPrincipal) -> ReportSaved:
    report, message = await service.create_report(payload)
    report_tasks.log(service.session, report.id, "created", *_who(principal))
    await service.session.commit()
    return ReportSaved(report=await _one(service, report), message=message)


@router.patch(
    "/{report_id}",
    response_model=ReportSaved,
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_EDIT]))],
)
async def update_report(
    report_id: uuid.UUID, payload: ReportUpdate, service: ServiceDep
) -> ReportSaved:
    report, message = await service.update_report(report_id, payload)
    return ReportSaved(report=await _one(service, report), message=message)


@router.post(
    "/{report_id}/status",
    response_model=ReportSaved,
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_STATUS]))],
)
async def change_status(
    report_id: uuid.UUID, payload: ReportStatusUpdate, service: ServiceDep, principal: CurrentPrincipal
) -> ReportSaved:
    before = (await service.get_report(report_id)).status
    report, message = await service.change_status(report_id, payload)
    if report.status != before:
        report_tasks.log(service.session, report.id, "status", *_who(principal), value=report.status, was=before)
        await service.session.commit()
    return ReportSaved(report=await _one(service, report), message=message)


@router.delete(
    "/{report_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_DELETE]))],  # officer+
)
async def delete_report(report_id: uuid.UUID, service: ServiceDep) -> Response:
    await service.delete_report(report_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{report_id}/discord",
    response_model=DiscordSent,
    summary="Отправить рапорт в текстовый канал Discord (вебхук клана)",
    description=(
        "Эмбед со строками рапорта; необязательный PNG (графический рапорт, сформированный "
        "клиентом) прикладывается картинкой. Без настроенного вебхука — 409 discord_not_configured."
    ),
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_DISCORD]))],
)
async def send_to_discord(
    report_id: uuid.UUID,
    service: ServiceDep,
    image: Annotated[UploadFile | None, File(description="PNG первой страницы рапорта")] = None,
) -> DiscordSent:
    attachment: tuple[str, bytes] | None = None
    if image is not None:
        data = await image.read(MAX_IMAGE_BYTES + 1)
        if len(data) > MAX_IMAGE_BYTES:
            raise AppError(
                message_key="report.image_too_large", domain="reports",
                code="too_large", status_code=413, params={"limit_mb": 8},
            )
        if data:
            attachment = ("report.png", data)
    report, message = await service.send_to_discord(report_id, attachment)
    return DiscordSent(report=await _one(service, report), message=message)


# ---------------- настройки клана --------------------------------------------- #
# ---------------- журнал выполнения заказа ----------------------------------- #
async def get_progress_service(
    session: ClanSession, principal: CurrentPrincipal, translator: ReportsTranslator
) -> ReportProgressService:
    return ReportProgressService(session, principal, translator)


ProgressDep = Annotated[ReportProgressService, Depends(get_progress_service)]


@router.get(
    "/{report_id}/progress",
    response_model=ReportProgressRead,
    summary="Выполнение заказа: выполнено по строкам и журнал вкладов",
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_READ]))],
)
async def report_progress(report_id: uuid.UUID, service: ProgressDep) -> ReportProgressRead:
    return await service.progress(report_id)


@router.post(
    "/{report_id}/progress",
    response_model=ReportProgressRead,
    status_code=status.HTTP_201_CREATED,
    summary="Сообщить о выполнении части заказа (сколько и на какой склад)",
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_PROGRESS]))],
)
async def add_progress(report_id: uuid.UUID, payload: ContributionCreate, service: ProgressDep, principal: CurrentPrincipal) -> ReportProgressRead:
    result = await service.contribute(report_id, payload)
    actor, actor_name = _who(principal)
    qty = sum(line.quantity for line in payload.lines)
    newest = max(result.contributions, key=lambda c: c.created_at, default=None)
    report_tasks.log(service.session, report_id, "contribution", actor, actor_name, qty=qty,
                     place=payload.stockpile_label or (newest.stockpile_label if newest else None), note=payload.note or None)
    report = (await service.session.execute(select(OrderReport).where(OrderReport.id == report_id))).scalar_one()
    await report_tasks.check_delivered(service.session, report, clan_id=principal.clan_id, actor_id=actor, actor_name=actor_name)
    await service.session.commit()
    return result


@router.delete(
    "/{report_id}/progress/{contribution_id}",
    response_model=ReportProgressRead,
    summary="Удалить запись журнала (свою; чужую — с правом reports:delete)",
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_READ]))],
)
async def remove_progress(report_id: uuid.UUID, contribution_id: uuid.UUID, service: ProgressDep) -> ReportProgressRead:
    return await service.remove_contribution(report_id, contribution_id)


@settings_router.get(
    "/settings",
    response_model=ClanSettingsRead,
    summary="Настройки клана (вебхук Discord — только признак и хвост)",
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_READ]))],
)
async def read_settings(service: SettingsServiceDep) -> ClanSettingsRead:
    return to_read(await service.get())


@settings_router.put(
    "/settings",
    response_model=ClanSettingsSaved,
    summary="Изменить настройки клана (admin+)",
    dependencies=[Depends(PermissionChecker([Scopes.CLAN_WEBHOOK]))],
)
async def update_settings(
    payload: ClanSettingsUpdate, service: SettingsServiceDep
) -> ClanSettingsSaved:
    row, message = await service.update(payload)
    return ClanSettingsSaved(settings=to_read(row), message=message)
