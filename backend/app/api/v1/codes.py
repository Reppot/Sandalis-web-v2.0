from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import PermissionChecker
from app.api.v1.items import get_catalog_service
from app.core.permissions import Scopes
from app.schemas.catalog import CatalogItemRead
from app.services.catalog import CatalogService

router = APIRouter(prefix="/codes", tags=["codes"])

ServiceDep = Annotated[CatalogService, Depends(get_catalog_service)]


@router.get(
    "",
    response_model=list[CatalogItemRead],
    summary="LEGACY (backend v1): поиск игровых кодов предметов — плоский список",
    dependencies=[Depends(PermissionChecker([Scopes.CATALOG_READ]))],
)
async def list_codes(
    service: ServiceDep,
    query: Annotated[str, Query(max_length=120)] = "",
    category: Annotated[str | None, Query(max_length=32)] = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 200,
) -> list[CatalogItemRead]:
    """
    Совместимость со старым фронтом: GET /api/v1/codes?query=&category=
    возвращал плоский список до 5000 предметов без пагинации.
    Отличие от v1: теперь требуется авторизация (catalog:read есть и у guest).
    """
    rows = await service.list_for_legacy_codes_endpoint(
        query=query, category=category, limit=limit
    )
    return [CatalogItemRead.from_item(r) for r in rows]
