from __future__ import annotations

import uuid
from typing import Annotated, Sequence

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status

from app.api.deps import (
    ClanSession,
    CurrentPrincipal,
    PermissionChecker,
    domain_translator,
)
from app.core.errors import AppError
from app.core.i18n import Translator
from app.core.permissions import Scopes
from app.models.report import OrderReport, ReportStatus
from app.schemas.clan_settings import ClanSettingsRead, ClanSettingsSaved, ClanSettingsUpdate
from app.schemas.common import Page
from app.schemas.report import (
    DiscordSent,
    ReportCreate,
    ReportLineRead,
    ReportRead,
    ReportSaved,
    ReportStatusUpdate,
    ReportUpdate,
)
from app.services.clan_settings import ClanSettingsService, to_read
from app.services.reports import ReportService

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


def _read(report: OrderReport, icons: dict[str, str | None]) -> ReportRead:
    lines = [
        ReportLineRead.model_validate(line).model_copy(
            update={"icon_url": icons.get(line.item_code or "")}
        )
        for line in report.lines
    ]
    read = ReportRead.model_validate(report)
    return read.model_copy(update={
        "lines": lines,
        "lines_count": len(lines),
        "total_quantity": sum(line.quantity for line in lines),
    })


async def _one(service: ReportService, report: OrderReport) -> ReportRead:
    return _read(report, await service.icons_for([report]))


async def _many(service: ReportService, reports: Sequence[OrderReport]) -> list[ReportRead]:
    icons = await service.icons_for(reports)
    return [_read(r, icons) for r in reports]


@router.get(
    "",
    response_model=Page[ReportRead],
    summary="Текущие заказы клана: рапорты снабжения (новые первыми)",
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_READ]))],
)
async def list_reports(
    service: ServiceDep,
    status_filter: Annotated[list[ReportStatus] | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[ReportRead]:
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
async def create_report(payload: ReportCreate, service: ServiceDep) -> ReportSaved:
    report, message = await service.create_report(payload)
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
    report_id: uuid.UUID, payload: ReportStatusUpdate, service: ServiceDep
) -> ReportSaved:
    report, message = await service.change_status(report_id, payload)
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
