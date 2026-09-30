from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import Principal, get_current_principal
from app.core.db import get_db
from app.models.stockpile import Stockpile
from app.schemas.stockpiles import (
    CreateStockpileRequest,
    StockpileItemResponse,
    StockpileResponse,
    UpdateStockpileItemsRequest,
)
from app.services.errors import EntityNotFoundError
from app.services.stockpiles import stockpile_service


router = APIRouter(
    prefix="/stockpiles",
    tags=["stockpiles"],
)


def _serialize_stockpile(
    stockpile: Stockpile,
) -> StockpileResponse:
    return StockpileResponse(
        id=stockpile.id,
        name=stockpile.name,
        location=stockpile.location,
        code=stockpile.code,
        items=[
            StockpileItemResponse(
                item_id=item.item_id,
                quantity=item.quantity,
            )
            for item in stockpile.items
        ],
        last_updated_by=stockpile.last_updated_by,
        updated_at=stockpile.updated_at,
    )


def _not_found(exc: EntityNotFoundError) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail=str(exc),
    )


@router.get("", response_model=list[StockpileResponse])
async def list_stockpiles(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> list[StockpileResponse]:
    stockpiles = await stockpile_service.list_all(
        db=db,
        principal=principal,
    )

    return [
        _serialize_stockpile(stockpile)
        for stockpile in stockpiles
    ]


@router.post(
    "",
    response_model=StockpileResponse,
    status_code=201,
)
async def create_stockpile(
    payload: CreateStockpileRequest,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> StockpileResponse:
    stockpile = await stockpile_service.create(
        db=db,
        principal=principal,
        payload=payload,
    )

    return _serialize_stockpile(stockpile)


@router.put(
    "/{stockpile_id}/items",
    response_model=StockpileResponse,
)
async def update_stockpile_items(
    stockpile_id: str,
    payload: UpdateStockpileItemsRequest,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> StockpileResponse:
    try:
        stockpile = await stockpile_service.update_items(
            db=db,
            principal=principal,
            stockpile_id=stockpile_id,
            payload=payload,
        )
    except EntityNotFoundError as exc:
        raise _not_found(exc) from exc

    return _serialize_stockpile(stockpile)


@router.delete(
    "/{stockpile_id}",
    status_code=204,
)
async def delete_stockpile(
    stockpile_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> Response:
    try:
        await stockpile_service.delete(
            db=db,
            principal=principal,
            stockpile_id=stockpile_id,
        )
    except EntityNotFoundError as exc:
        raise _not_found(exc) from exc

    return Response(status_code=204)