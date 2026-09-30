from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import Principal, get_current_principal
from app.core.db import get_db
from app.models.order import Order
from app.schemas.orders import (
    OrderCreateRequest,
    OrderItemResponse,
    OrderResponse,
    OrderStatusUpdateRequest,
)
from app.services.errors import (
    EntityNotFoundError,
    PermissionDeniedError,
    ValidationServiceError,
)
from app.services.orders import order_service


router = APIRouter(
    prefix="/orders",
    tags=["orders"],
)


def _serialize_order(order: Order) -> OrderResponse:
    return OrderResponse(
        id=order.id,
        creator_id=order.creator_id,
        assignee_id=order.assignee_id,
        status=order.status,
        items=[
            OrderItemResponse(
                item_id=item.item_id,
                quantity=item.quantity,
                completed_quantity=item.completed_quantity,
            )
            for item in order.items
        ],
        destination=order.destination,
        notes=order.notes,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )


def _service_error(exc: Exception) -> HTTPException:
    if isinstance(exc, EntityNotFoundError):
        return HTTPException(status_code=404, detail=str(exc))

    if isinstance(exc, PermissionDeniedError):
        return HTTPException(status_code=403, detail=str(exc))

    if isinstance(exc, ValidationServiceError):
        return HTTPException(status_code=422, detail=str(exc))

    return HTTPException(status_code=500, detail="Order operation failed")


@router.get("", response_model=list[OrderResponse])
async def list_orders(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> list[OrderResponse]:
    orders = await order_service.list_all(
        db=db,
        principal=principal,
    )

    return [_serialize_order(order) for order in orders]


@router.post("", response_model=OrderResponse, status_code=201)
async def create_order(
    payload: OrderCreateRequest,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> OrderResponse:
    try:
        order = await order_service.create(
            db=db,
            principal=principal,
            payload=payload,
        )
    except Exception as exc:
        raise _service_error(exc) from exc

    return _serialize_order(order)


@router.patch(
    "/{order_id}/status",
    response_model=OrderResponse,
)
async def update_order_status(
    order_id: str,
    payload: OrderStatusUpdateRequest,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> OrderResponse:
    try:
        order = await order_service.update_status(
            db=db,
            principal=principal,
            order_id=order_id,
            new_status=payload.status,
        )
    except Exception as exc:
        raise _service_error(exc) from exc

    return _serialize_order(order)


@router.post(
    "/{order_id}/claim",
    response_model=OrderResponse,
)
async def claim_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> OrderResponse:
    try:
        order = await order_service.claim(
            db=db,
            principal=principal,
            order_id=order_id,
        )
    except Exception as exc:
        raise _service_error(exc) from exc

    return _serialize_order(order)


@router.delete(
    "/{order_id}",
    status_code=204,
)
async def delete_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> Response:
    try:
        await order_service.delete(
            db=db,
            principal=principal,
            order_id=order_id,
        )
    except Exception as exc:
        raise _service_error(exc) from exc

    return Response(status_code=204)