from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, Query

from app.api.deps import PermissionChecker
from app.core.errors import AppError
from app.core.permissions import Scopes
from app.schemas.world import FrontlineRead, WorldMapRead, WorldRead
from app.services.war_api import world_regions
from app.services.war_map import world_frontline, world_map, world_map_overview, world_map_regions

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


@router.get(
    "/map/overview",
    response_model=WorldMapRead,
    summary="Обзор карты без динамических построек",
    dependencies=[Depends(PermissionChecker([Scopes.CATALOG_READ]))],
)
async def read_map_overview() -> WorldMapRead:
    try:
        return WorldMapRead.model_validate(await world_map_overview())
    except (httpx.HTTPError, ValueError) as exc:
        raise AppError(message_key="errors.war_api_unavailable", code="war_api_unavailable", status_code=502, params={}) from exc


@router.get(
    "/map/regions",
    response_model=WorldMapRead,
    summary="Динамические постройки только выбранных гексов",
    dependencies=[Depends(PermissionChecker([Scopes.CATALOG_READ]))],
)
async def read_map_regions(regions: list[str] = Query(default=[], max_length=60)) -> WorldMapRead:
    try:
        return WorldMapRead.model_validate(await world_map_regions(regions))
    except (httpx.HTTPError, ValueError) as exc:
        raise AppError(message_key="errors.war_api_unavailable", code="war_api_unavailable", status_code=502, params={}) from exc


@router.get(
    "/map/frontline",
    response_model=FrontlineRead,
    summary="Сводная линия фронта по ратушам фракций",
    dependencies=[Depends(PermissionChecker([Scopes.CATALOG_READ]))],
)
async def read_frontline() -> FrontlineRead:
    try:
        return FrontlineRead(points=await world_frontline())
    except (httpx.HTTPError, ValueError) as exc:
        raise AppError(message_key="errors.war_api_unavailable", code="war_api_unavailable", status_code=502, params={}) from exc
