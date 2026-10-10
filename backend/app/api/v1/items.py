from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import (
    ClanSession,
    CurrentPrincipal,
    PermissionChecker,
    domain_translator,
)
from app.core.i18n import Translator
from app.core.permissions import Scopes
from app.schemas.catalog import CatalogItemRead
from app.schemas.common import Page
from app.services.catalog import CatalogService

router = APIRouter(prefix="/items", tags=["catalog"])

CatalogTranslator = Annotated[Translator, Depends(domain_translator("catalog"))]


async def get_catalog_service(
    session: ClanSession,
    principal: CurrentPrincipal,
    translator: CatalogTranslator,
) -> CatalogService:
    return CatalogService(session, principal, translator)


ServiceDep = Annotated[CatalogService, Depends(get_catalog_service)]


@router.get(
    "",
    response_model=Page[CatalogItemRead],
    summary="Поиск по глобальному каталогу предметов",
    dependencies=[Depends(PermissionChecker([Scopes.CATALOG_READ]))],
)
async def list_items(
    service: ServiceDep,
    query: Annotated[str, Query(max_length=120)] = "",
    category: Annotated[str | None, Query(max_length=32)] = None,
    active_only: Annotated[bool, Query()] = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[CatalogItemRead]:
    rows, total = await service.list_items(
        query=query, category=category, active_only=active_only,
        limit=limit, offset=offset,
    )
    return Page[CatalogItemRead](
        items=[CatalogItemRead.from_item(r) for r in rows],
        total=total, limit=limit, offset=offset,
    )


@router.get(
    "/{code}",
    response_model=CatalogItemRead,
    summary="Предмет каталога по коду",
    dependencies=[Depends(PermissionChecker([Scopes.CATALOG_READ]))],
)
async def get_item(code: str, service: ServiceDep) -> CatalogItemRead:
    return CatalogItemRead.from_item(await service.get_item(code))
