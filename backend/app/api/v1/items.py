from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Query, UploadFile

from app.api.deps import (
    ClanSession,
    CurrentPrincipal,
    PermissionChecker,
    domain_translator,
)
from app.core.errors import AppError
from app.core.i18n import Translator
from app.core.permissions import Scopes
from app.domain.catalog.parsers import ParsedLine
from app.models.catalog import CatalogItem
from app.schemas.catalog import (
    CatalogItemRead,
    ParsedLineRead,
    ParseRequest,
    ParseResult,
    ResolvedName,
    ResolveRequest,
    ScanResult,
)
from app.schemas.common import Page
from app.schemas.recipe import RecipeRead
from app.services.catalog import CatalogService

router = APIRouter(prefix="/items", tags=["catalog"])
recipes_router = APIRouter(prefix="/recipes", tags=["catalog"])

CatalogTranslator = Annotated[Translator, Depends(domain_translator("catalog"))]
CatalogRead = [Depends(PermissionChecker([Scopes.CATALOG_READ]))]

MAX_SAV_BYTES = 64 * 1024 * 1024


async def get_catalog_service(
    session: ClanSession,
    principal: CurrentPrincipal,
    translator: CatalogTranslator,
) -> CatalogService:
    return CatalogService(session, principal, translator)


ServiceDep = Annotated[CatalogService, Depends(get_catalog_service)]


def _parse_result(rows: list[tuple[ParsedLine, CatalogItem | None]]) -> ParseResult:
    lines = [
        ParsedLineRead(
            name=line.name, count=line.count, unit=line.unit,
            item=CatalogItemRead.from_item(item) if item else None,
        )
        for line, item in rows
    ]
    unknown = list(dict.fromkeys(line.name for line in lines if line.item is None))
    return ParseResult(lines=lines, matched=len(lines) - sum(1 for l in lines if not l.item), unknown=unknown)


@router.get(
    "",
    response_model=Page[CatalogItemRead],
    summary="Поиск по глобальному каталогу предметов",
    dependencies=CatalogRead,
)
async def list_items(
    service: ServiceDep,
    query: Annotated[str, Query(max_length=120)] = "",
    category: Annotated[str | None, Query(max_length=32)] = None,
    faction: Annotated[str | None, Query(max_length=16)] = None,
    needs_review: Annotated[bool | None, Query()] = None,
    active_only: Annotated[bool, Query()] = False,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[CatalogItemRead]:
    rows, total = await service.list_items(
        query=query, category=category, active_only=active_only,
        faction=faction, needs_review=needs_review,
        limit=min(limit, 500), offset=offset,
    )
    return Page[CatalogItemRead](
        items=[CatalogItemRead.from_item(r) for r in rows],
        total=total, limit=limit, offset=offset,
    )


@router.post(
    "/parse",
    response_model=ParseResult,
    summary="Разобрать отчёт сканера/Discord/CSV и сопоставить строки с каталогом",
    dependencies=CatalogRead,
)
async def parse_report(payload: ParseRequest, service: ServiceDep) -> ParseResult:
    return _parse_result(await service.parse(payload.text))


@router.post(
    "/resolve",
    response_model=list[ResolvedName],
    summary="Сопоставить свободные названия с предметами каталога",
    dependencies=CatalogRead,
)
async def resolve_names(payload: ResolveRequest, service: ServiceDep) -> list[ResolvedName]:
    return [
        ResolvedName(name=name, item=CatalogItemRead.from_item(item) if item else None)
        for name, item in await service.resolve_names(payload.names)
    ]


@router.post(
    "/scan",
    response_model=ScanResult,
    summary="Просканировать MapData.sav: найти коды каталога и их количество",
    description="Файл разбирается в памяти и не сохраняется. Лимит 64 МБ.",
    dependencies=CatalogRead,
)
async def scan_save(
    service: ServiceDep,
    file: Annotated[UploadFile, File(description="MapData.sav")],
) -> ScanResult:
    buf = await file.read(MAX_SAV_BYTES + 1)
    if len(buf) > MAX_SAV_BYTES:
        raise AppError(
            message_key="scan.too_large", domain="catalog", code="too_large",
            status_code=413, params={"limit_mb": MAX_SAV_BYTES // (1024 * 1024)},
        )
    rows, strict = await service.scan_map_data(buf)
    result = _parse_result(list(rows))
    return ScanResult(
        **result.model_dump(), file_name=file.filename or "MapData.sav",
        file_size=len(buf), strict=strict,
    )


@router.get(
    "/{code}",
    response_model=CatalogItemRead,
    summary="Предмет каталога по коду",
    dependencies=CatalogRead,
)
async def get_item(code: str, service: ServiceDep) -> CatalogItemRead:
    return CatalogItemRead.from_item(await service.get_item(code))


@recipes_router.get(
    "",
    response_model=list[RecipeRead],
    summary="Рецепты Factory / MPF / Refinery (данные калькуляторов)",
    dependencies=CatalogRead,
)
async def list_recipes(
    service: ServiceDep,
    kind: Annotated[Literal["factory", "refinery"] | None, Query()] = None,
    facility: Annotated[Literal["factory", "mpf", "refinery"] | None, Query()] = None,
    faction: Annotated[str | None, Query(max_length=16)] = None,
    category: Annotated[str | None, Query(max_length=32)] = None,
    query: Annotated[str, Query(max_length=120)] = "",
) -> list[RecipeRead]:
    rows = await service.list_recipes(
        kind=kind, facility=facility, faction=faction, category=category, query=query
    )
    return [RecipeRead.model_validate(r) for r in rows]
