from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends

from app.api.deps import PermissionChecker
from app.core.errors import AppError
from app.core.permissions import Scopes
from app.schemas.world import WorldMapRead, WorldRead
from app.services.war_api import world_regions
from app.services.war_map import world_map

router = APIRouter(prefix="/world", tags=["world"])


@router.get(
    "/regions",
    response_model=WorldRead,
    summary="Регионы и города текущей войны: владельцы, города победы, депо и порты (Foxhole War API)",
    dependencies=[Depends(PermissionChecker([Scopes.CATALOG_READ]))],
)
async def read_regions() -> WorldRead:
    try:
        return WorldRead.model_validate(await world_regions())
    except (httpx.HTTPError, ValueError) as exc:
        raise AppError(message_key="errors.war_api_unavailable", code="war_api_unavailable", status_code=502, params={}) from exc


@router.get(
    "/map",
    response_model=WorldMapRead,
    summary="Карта войны для планирования: гексы и ключевые постройки, снимок раз в сутки (Foxhole War API)",
    dependencies=[Depends(PermissionChecker([Scopes.CATALOG_READ]))],
)
async def read_map() -> WorldMapRead:
    try:
        return WorldMapRead.model_validate(await world_map())
    except (httpx.HTTPError, ValueError) as exc:
        raise AppError(message_key="errors.war_api_unavailable", code="war_api_unavailable", status_code=502, params={}) from exc
