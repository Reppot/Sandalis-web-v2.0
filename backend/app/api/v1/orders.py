from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import (
    ClanSession,
    CurrentPrincipal,
    PermissionChecker,
    TranslatorDep,
    domain_translator,
)
from app.core.i18n import Translator
from app.core.permissions import Scopes
from app.core.security import Principal
from app.models.order import OrderStatus
from app.schemas.order import (
    OrderCreate,
    OrderCreated,
    OrderRead,
    OrderStatusUpdate,
    OrderUpdate,
    Page,
)
from app.services.orders import OrderService

router = APIRouter(prefix="/orders", tags=["orders"])

ProductionTranslator = Annotated[Translator, Depends(domain_translator("production"))]


async def get_order_service(
    session: ClanSession,
    principal: CurrentPrincipal,
    translator: ProductionTranslator,
) -> OrderService:
    return OrderService(session, principal, translator)


ServiceDep = Annotated[OrderService, Depends(get_order_service)]


@router.get(
    "",
    response_model=Page[OrderRead],
    summary="Список заказов текущего клана",
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_READ]))],
)
async def list_orders(
    service: ServiceDep,
    status_filter: Annotated[OrderStatus | None, Query(alias="status")] = None,
    assignee_id: Annotated[str | None, Query(max_length=64)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[OrderRead]:
    rows, total = await service.list_orders(
        status=status_filter, assignee_id=assignee_id, limit=limit, offset=offset
    )
    return Page[OrderRead](
        items=[OrderRead.model_validate(r) for r in rows],
        total=total, limit=limit, offset=offset,
    )


@router.get(
    "/{order_id}",
    response_model=OrderRead,
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_READ]))],
)
async def get_order(order_id: uuid.UUID, service: ServiceDep) -> OrderRead:
    return OrderRead.model_validate(await service.get_order(order_id))


@router.post(
    "",
    response_model=OrderCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Создать заказ (нужны orders:write + stockpiles:read)",
)
async def create_order(
    payload: OrderCreate,
    service: ServiceDep,
    # вариант с получением Principal прямо из чекера
    principal: Annotated[
        Principal, Depends(PermissionChecker([Scopes.REPORTS_CREATE, Scopes.STOCKPILES_READ]))
    ],
) -> OrderCreated:
    order, message = await service.create_order(payload)
    return OrderCreated(order=OrderRead.model_validate(order), message=message)


@router.patch(
    "/{order_id}",
    response_model=OrderRead,
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_EDIT]))],
)
async def update_order(
    order_id: uuid.UUID, payload: OrderUpdate, service: ServiceDep
) -> OrderRead:
    return OrderRead.model_validate(await service.update_order(order_id, payload))


@router.post(
    "/{order_id}/status",
    response_model=OrderCreated,
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_STATUS]))],
)
async def change_status(
    order_id: uuid.UUID, payload: OrderStatusUpdate, service: ServiceDep
) -> OrderCreated:
    order, message = await service.change_status(order_id, payload)
    return OrderCreated(order=OrderRead.model_validate(order), message=message)


@router.delete(
    "/{order_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(PermissionChecker([Scopes.REPORTS_DELETE]))],  # officer+
)
async def delete_order(order_id: uuid.UUID, service: ServiceDep) -> Response:
    await service.delete_order(order_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
