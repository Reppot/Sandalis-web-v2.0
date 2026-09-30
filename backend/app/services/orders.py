from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import Principal
from app.models.order import Order, OrderItem
from app.schemas.orders import OrderCreateRequest
from app.services.errors import (
    EntityNotFoundError,
    PermissionDeniedError,
    ValidationServiceError,
)


_ALLOWED_STATUSES = {
    "pending",
    "processing",
    "completed",
    "cancelled",
}


class OrderService:
    async def list_all(
        self,
        db: AsyncSession,
        principal: Principal,
    ) -> list[Order]:
        result = await db.execute(
            select(Order)
            .options(selectinload(Order.items))
            .order_by(Order.created_at.desc())
        )

        return list(result.scalars().all())

    async def create(
        self,
        db: AsyncSession,
        principal: Principal,
        payload: OrderCreateRequest,
    ) -> Order:
        for item in payload.items:
            if item.completed_quantity > item.quantity:
                raise ValidationServiceError(
                    "Completed quantity cannot exceed requested quantity",
                )

        order = Order(
            creator_id=principal.actor_id,
            status="pending",
            destination=payload.destination,
            notes=payload.notes,
            items=[
                OrderItem(
                    item_id=item.item_id,
                    quantity=item.quantity,
                    completed_quantity=item.completed_quantity,
                )
                for item in payload.items
            ],
        )

        db.add(order)
        await db.flush()

        return await self._get_by_id(db, order.id)

    async def update_status(
        self,
        db: AsyncSession,
        principal: Principal,
        order_id: str,
        new_status: str,
    ) -> Order:
        if new_status not in _ALLOWED_STATUSES:
            raise ValidationServiceError(
                f"Unsupported order status: {new_status}",
            )

        order = await self._get_by_id(db, order_id)

        if (
            not principal.is_admin
            and order.creator_id != principal.actor_id
            and order.assignee_id != principal.actor_id
        ):
            raise PermissionDeniedError(
                "Only the order owner, assignee or admin can update it",
            )

        order.status = new_status
        await db.flush()

        return await self._get_by_id(db, order_id)

    async def claim(
        self,
        db: AsyncSession,
        principal: Principal,
        order_id: str,
    ) -> Order:
        order = await self._get_by_id(db, order_id)

        if order.status != "pending":
            raise ValidationServiceError(
                "Only pending orders can be claimed",
            )

        order.assignee_id = principal.actor_id
        order.status = "processing"

        await db.flush()
        return await self._get_by_id(db, order_id)

    async def delete(
        self,
        db: AsyncSession,
        principal: Principal,
        order_id: str,
    ) -> None:
        order = await self._get_by_id(db, order_id)

        if (
            not principal.is_admin
            and order.creator_id != principal.actor_id
        ):
            raise PermissionDeniedError(
                "Only the order owner or admin can delete it",
            )

        await db.delete(order)
        await db.flush()

    async def _get_by_id(
        self,
        db: AsyncSession,
        order_id: str,
    ) -> Order:
        result = await db.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.id == order_id)
        )

        order = result.scalar_one_or_none()

        if order is None:
            raise EntityNotFoundError("Order not found")

        return order


order_service = OrderService()