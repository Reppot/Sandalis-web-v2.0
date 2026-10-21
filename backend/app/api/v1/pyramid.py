"""Пирамида снабжения клана (/clan/pyramid): читают все, у кого есть склады; правят — с правом
stockpiles:pyramid (средний доступ и выше). Сравнение со складом делает клиент: содержимое склада у него уже есть."""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import PermissionChecker
from app.api.v1.reports import SettingsServiceDep
from app.core.errors import AppError
from app.core.permissions import Scopes
from app.domain.pyramid import default_pyramid
from app.models.catalog import CatalogItem
from app.models.clan_settings import ClanSettings
from app.schemas.clan_settings import PyramidRead, PyramidUpdate

router = APIRouter(prefix="/clan", tags=["clan"])
CanRead = [Depends(PermissionChecker([Scopes.STOCKPILES_READ]))]
CanEdit = [Depends(PermissionChecker([Scopes.STOCKPILES_PYRAMID]))]


def _read(row: ClanSettings | None) -> PyramidRead:
    if row is None or not row.supply_pyramid:
        return PyramidRead(**default_pyramid(), is_default=True, updated_at=None)
    return PyramidRead(**row.supply_pyramid, is_default=False, updated_at=row.supply_pyramid_updated_at)


@router.get("/pyramid", response_model=PyramidRead, summary="Пирамида снабжения клана (или шаблон)", dependencies=CanRead)
async def read_pyramid(service: SettingsServiceDep) -> PyramidRead:
    return _read(await service.get())


@router.put("/pyramid", response_model=PyramidRead, summary="Сохранить пирамиду снабжения", dependencies=CanEdit)
async def save_pyramid(payload: PyramidUpdate, service: SettingsServiceDep) -> PyramidRead:
    codes = {i.code for t in payload.tiers for i in t.items}
    known = set((await service.session.execute(select(CatalogItem.code).where(CatalogItem.code.in_(codes)))).scalars())
    unknown = sorted(codes - known)
    if unknown:
        raise AppError(message_key="errors.pyramid_unknown_items", code="validation_error", status_code=422,
                       params={"codes": ", ".join(unknown[:5])})
    row = await service.get()
    if row is None:
        row = ClanSettings()
        service.session.add(row)
    row.supply_pyramid = payload.model_dump()
    row.supply_pyramid_updated_at = datetime.now(UTC)
    await service.session.commit()
    return _read(row)


@router.delete("/pyramid", response_model=PyramidRead, summary="Вернуть шаблон пирамиды", dependencies=CanEdit)
async def reset_pyramid(service: SettingsServiceDep) -> PyramidRead:
    row = await service.get()
    if row is not None:
        row.supply_pyramid = None
        row.supply_pyramid_updated_at = None
        await service.session.commit()
    return _read(None)
