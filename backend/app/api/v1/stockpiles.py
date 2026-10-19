from __future__ import annotations

import uuid
from typing import Annotated, Sequence

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import (
    ClanSession,
    CurrentPrincipal,
    PermissionChecker,
    domain_translator,
)
from app.core.i18n import Translator
from app.core.permissions import Scopes
from app.models.stockpile import Stockpile, StockpileItem
from app.schemas.common import Page
from app.schemas.stockpile import (
    StockpileContentsReplace,
    StockpileContentsSaved,
    StockpileCreate,
    StockpileCreated,
    StockpileDetailRead,
    StockpileItemPatch,
    StockpileItemRead,
    StockpileItemSaved,
    StockpileItemUpsert,
    StockpileRead,
    StockpileUpdate,
)
from app.services.stockpiles import StockpileService

router = APIRouter(prefix="/stockpiles", tags=["stockpiles"])

StockpilesTranslator = Annotated[Translator, Depends(domain_translator("stockpiles"))]


async def get_stockpile_service(
    session: ClanSession,
    principal: CurrentPrincipal,
    translator: StockpilesTranslator,
) -> StockpileService:
    return StockpileService(session, principal, translator)


ServiceDep = Annotated[StockpileService, Depends(get_stockpile_service)]


def _read(
    stockpile: Stockpile, agg: tuple[int, int] | None = None
) -> StockpileRead:
    read = StockpileRead.model_validate(stockpile)
    if agg is not None:
        read = read.model_copy(update={"items_count": agg[0], "total_quantity": agg[1]})
    return read


async def _detail(
    service: StockpileService, stockpile: Stockpile, items: Sequence[StockpileItem]
) -> StockpileDetailRead:
    brief = await service.catalog_brief(i.item_code for i in items)
    item_reads = [
        StockpileItemRead.model_validate(i).model_copy(update={
            "name": brief.get(i.item_code, (None, None))[0],
            "icon_url": brief.get(i.item_code, (None, None))[1],
        })
        for i in items
    ]
    read = StockpileDetailRead.model_validate(stockpile)
    return read.model_copy(update={
        "items": item_reads,
        "items_count": len(item_reads),
        "total_quantity": sum(i.quantity for i in item_reads),
    })


# ---------------- stockpiles ------------------------------------------------- #
@router.get(
    "",
    response_model=Page[StockpileRead],
    summary="Склады текущего клана",
    dependencies=[Depends(PermissionChecker([Scopes.STOCKPILES_READ]))],
)
async def list_stockpiles(
    service: ServiceDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[StockpileRead]:
    rows, total, aggs = await service.list_stockpiles(limit=limit, offset=offset)
    return Page[StockpileRead](
        items=[_read(r, aggs.get(r.id)) for r in rows],
        total=total, limit=limit, offset=offset,
    )


@router.post(
    "",
    response_model=StockpileCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Создать склад",
    dependencies=[Depends(PermissionChecker([Scopes.STOCKPILES_WRITE]))],
)
async def create_stockpile(payload: StockpileCreate, service: ServiceDep) -> StockpileCreated:
    stockpile, message = await service.create_stockpile(payload)
    return StockpileCreated(stockpile=_read(stockpile), message=message)


@router.get(
    "/{stockpile_id}",
    response_model=StockpileDetailRead,
    summary="Склад с позициями",
    dependencies=[Depends(PermissionChecker([Scopes.STOCKPILES_READ]))],
)
async def get_stockpile(stockpile_id: uuid.UUID, service: ServiceDep) -> StockpileDetailRead:
    stockpile, items = await service.get_detail(stockpile_id)
    return await _detail(service, stockpile, items)


@router.patch(
    "/{stockpile_id}",
    response_model=StockpileCreated,
    dependencies=[Depends(PermissionChecker([Scopes.STOCKPILES_WRITE]))],
)
async def update_stockpile(
    stockpile_id: uuid.UUID, payload: StockpileUpdate, service: ServiceDep
) -> StockpileCreated:
    stockpile, message = await service.update_stockpile(stockpile_id, payload)
    return StockpileCreated(stockpile=_read(stockpile), message=message)


@router.delete(
    "/{stockpile_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(PermissionChecker([Scopes.STOCKPILES_WRITE]))],
)
async def delete_stockpile(stockpile_id: uuid.UUID, service: ServiceDep) -> Response:
    await service.delete_stockpile(stockpile_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------- stockpile items -------------------------------------------- #
@router.put(
    "/{stockpile_id}/items",
    response_model=StockpileContentsSaved,
    summary="Заменить содержимое склада выгрузкой сканера (монитор склада)",
    dependencies=[Depends(PermissionChecker([Scopes.STOCKPILES_WRITE]))],
)
async def replace_contents(
    stockpile_id: uuid.UUID, payload: StockpileContentsReplace, service: ServiceDep
) -> StockpileContentsSaved:
    stockpile, items, message = await service.replace_contents(stockpile_id, payload)
    return StockpileContentsSaved(
        stockpile=await _detail(service, stockpile, items), message=message
    )


@router.post(
    "/{stockpile_id}/items",
    response_model=StockpileItemSaved,
    status_code=status.HTTP_201_CREATED,
    summary="Идемпотентный upsert позиции склада",
    dependencies=[Depends(PermissionChecker([Scopes.STOCKPILES_WRITE]))],
)
async def upsert_item(
    stockpile_id: uuid.UUID, payload: StockpileItemUpsert, service: ServiceDep
) -> StockpileItemSaved:
    row, message = await service.upsert_item(stockpile_id, payload)
    return StockpileItemSaved(item=StockpileItemRead.model_validate(row), message=message)


@router.patch(
    "/{stockpile_id}/items/{item_code}",
    response_model=StockpileItemSaved,
    dependencies=[Depends(PermissionChecker([Scopes.STOCKPILES_WRITE]))],
)
async def patch_item(
    stockpile_id: uuid.UUID, item_code: str, payload: StockpileItemPatch, service: ServiceDep
) -> StockpileItemSaved:
    row, message = await service.patch_item(stockpile_id, item_code, payload)
    return StockpileItemSaved(item=StockpileItemRead.model_validate(row), message=message)


@router.delete(
    "/{stockpile_id}/items/{item_code}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(PermissionChecker([Scopes.STOCKPILES_WRITE]))],
)
async def delete_item(stockpile_id: uuid.UUID, item_code: str, service: ServiceDep) -> Response:
    await service.delete_item(stockpile_id, item_code)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
