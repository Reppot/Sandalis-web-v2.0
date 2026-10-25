"""Пирамида снабжения клана (/clan/pyramid): читают все, у кого есть склады; свои (кастомные)
конфигурации — до MAX_CONFIGS на клан — создают и правят с правом stockpiles:pyramid. Сравнение со
складом делает клиент: содержимое склада у него уже есть."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy import select

from app.api.deps import PermissionChecker
from app.api.v1.reports import SettingsServiceDep
from app.core.errors import AppError
from app.core.permissions import Scopes
from app.domain.pyramid import default_pyramid, presets
from app.models.catalog import CatalogItem
from app.models.clan_settings import ClanSettings
from app.schemas.clan_settings import PyramidConfigRead, PyramidConfigWrite, PyramidRead
from app.services.clan_settings import ClanSettingsService

router = APIRouter(prefix="/clan", tags=["clan"])
CanRead = [Depends(PermissionChecker([Scopes.STOCKPILES_READ]))]
CanEdit = [Depends(PermissionChecker([Scopes.STOCKPILES_PYRAMID]))]

MAX_CONFIGS = 10
NOT_IN_PYRAMID = frozenset({"vehicles", "structures"})
# до именованных конфигураций клан хранил одну пирамиду: {"faction", "tiers"}
LEGACY_NAME = "Пирамида клана"


def _configs(row: ClanSettings | None) -> list[dict[str, Any]]:
    data = (row.supply_pyramid if row else None) or {}
    if "configs" in data:
        return list(data["configs"])
    if data.get("tiers"):
        at = row.supply_pyramid_updated_at.isoformat() if row and row.supply_pyramid_updated_at else None
        return [{"id": "legacy", "name": LEGACY_NAME, "faction": data.get("faction", "warden"),
                 "tiers": data["tiers"], "updated_at": at, "updated_by": None}]
    return []


def _read(row: ClanSettings | None) -> PyramidRead:
    configs = _configs(row)
    return PyramidRead(
        **default_pyramid(configs[0]["faction"] if configs else "warden"),
        is_default=not configs,
        updated_at=row.supply_pyramid_updated_at if row else None,
        presets=presets(),
        configs=[PyramidConfigRead(**c) for c in configs],
        max_configs=MAX_CONFIGS,
    )


async def _validate(service: ClanSettingsService, payload: PyramidConfigWrite) -> None:
    codes = {i.code for t in payload.tiers for i in t.items}
    rows = (await service.session.execute(
        select(CatalogItem.code, CatalogItem.category).where(CatalogItem.code.in_(codes))
    )).all()
    unknown = sorted(codes - {code for code, _ in rows})
    if unknown:
        raise AppError(message_key="errors.pyramid_unknown_items", code="validation_error", status_code=422,
                       params={"codes": ", ".join(unknown[:5])})
    # техника и сооружения в пирамиду не входят: она про ящики снабжения
    banned = sorted(code for code, category in rows if category in NOT_IN_PYRAMID)
    if banned:
        raise AppError(message_key="errors.pyramid_no_vehicles", code="validation_error", status_code=422,
                       params={"codes": ", ".join(banned[:5])})


def _name_taken(configs: list[dict[str, Any]], name: str, skip_id: str | None = None) -> bool:
    return any(c["name"].casefold() == name.casefold() and c["id"] != skip_id for c in configs)


async def _store(service: ClanSettingsService, row: ClanSettings | None, configs: list[dict[str, Any]]) -> PyramidRead:
    if row is None:
        row = ClanSettings()
        service.session.add(row)
    row.supply_pyramid = {"configs": configs}          # новый объект — JSONB видит изменение
    row.supply_pyramid_updated_at = datetime.now(UTC)
    await service.session.commit()
    return _read(row)


def _config(payload: PyramidConfigWrite, config_id: str, author: str) -> dict[str, Any]:
    tiers = [t for t in payload.model_dump()["tiers"] if t["items"]] or payload.model_dump()["tiers"][:1]
    return {"id": config_id, "name": payload.name, "faction": payload.faction, "tiers": tiers,
            "updated_at": datetime.now(UTC).isoformat(), "updated_by": author}


def _author(service: ClanSettingsService) -> str:
    return (service.principal.display_name or service.principal.user_id)[:64]


@router.get("/pyramid", response_model=PyramidRead, summary="Пирамида снабжения: шаблоны и конфигурации клана", dependencies=CanRead)
async def read_pyramid(service: SettingsServiceDep) -> PyramidRead:
    return _read(await service.get())


@router.post("/pyramid/configs", response_model=PyramidRead, status_code=status.HTTP_201_CREATED,
             summary="Сохранить новую кастомную конфигурацию", dependencies=CanEdit)
async def create_config(payload: PyramidConfigWrite, service: SettingsServiceDep) -> PyramidRead:
    await _validate(service, payload)
    row = await service.get()
    configs = _configs(row)
    if len(configs) >= MAX_CONFIGS:
        raise AppError(message_key="errors.pyramid_too_many", code="conflict", status_code=409,
                       params={"n": MAX_CONFIGS})
    if _name_taken(configs, payload.name):
        raise AppError(message_key="errors.pyramid_name_taken", code="conflict", status_code=409,
                       params={"name": payload.name})
    configs.append(_config(payload, uuid.uuid4().hex[:12], _author(service)))
    return await _store(service, row, configs)


@router.put("/pyramid/configs/{config_id}", response_model=PyramidRead,
            summary="Изменить кастомную конфигурацию", dependencies=CanEdit)
async def update_config(config_id: str, payload: PyramidConfigWrite, service: SettingsServiceDep) -> PyramidRead:
    await _validate(service, payload)
    row = await service.get()
    configs = _configs(row)
    if not any(c["id"] == config_id for c in configs):
        raise AppError(message_key="errors.pyramid_config_not_found", code="not_found", status_code=404)
    if _name_taken(configs, payload.name, skip_id=config_id):
        raise AppError(message_key="errors.pyramid_name_taken", code="conflict", status_code=409,
                       params={"name": payload.name})
    configs = [_config(payload, config_id, _author(service)) if c["id"] == config_id else c for c in configs]
    return await _store(service, row, configs)


@router.delete("/pyramid/configs/{config_id}", response_model=PyramidRead,
               summary="Удалить кастомную конфигурацию", dependencies=CanEdit)
async def delete_config(config_id: str, service: SettingsServiceDep) -> PyramidRead:
    row = await service.get()
    configs = _configs(row)
    if not any(c["id"] == config_id for c in configs):
        raise AppError(message_key="errors.pyramid_config_not_found", code="not_found", status_code=404)
    return await _store(service, row, [c for c in configs if c["id"] != config_id])
