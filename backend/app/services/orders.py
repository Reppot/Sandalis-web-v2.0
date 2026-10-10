from __future__ import annotations

import uuid
from typing import Sequence

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.errors import ConflictError, NotFoundError
from app.models.catalog import CatalogItem
from app.models.order import ALLOWED_TRANSITIONS, Order, OrderStatus
from app.models.stockpile import StockpileItem
from app.schemas.order import OrderCreate, OrderStatusUpdate, OrderUpdate
from app.services.base import ClanScopedService

DOMAIN = "production"


class OrderService(ClanScopedService):
    """Нигде в теле методов нет ручного `clan_id=...` при создании —
    его проставляет before_flush-гвард; фильтрация идёт автоматически."""

    # ---------------- read ------------------------------------------------ #
    async def list_orders(
        self,
        *,
        status: OrderStatus | None = None,
        assignee_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[Sequence[Order], int]:
        stmt = self._scoped(select(Order), Order)
        if status is not None:
            stmt = stmt.where(Order.status == status)
        if assignee_id is not None:
            stmt = stmt.where(Order.assignee_id == assignee_id)

        total = await self._count(stmt)
        rows = (
            await self.session.execute(
                stmt.order_by(Order.created_at.desc()).limit(min(limit, 200)).offset(offset)
            )
        ).scalars().all()
        return rows, total

    async def get_order(self, order_id: uuid.UUID) -> Order:
        return await self._get_scoped(
            Order, order_id,
            not_found_key="order.not_found", domain=DOMAIN,
            params={"order_id": str(order_id)},
        )

    # ---------------- write ----------------------------------------------- #
    async def create_order(self, payload: OrderCreate) -> tuple[Order, str]:
        # CatalogItem — глобальная таблица, фильтр по clan_id к ней НЕ применяется
        item = (
            await self.session.execute(
                select(CatalogItem).where(
                    CatalogItem.code == payload.item_code, CatalogItem.is_active.is_(True)
                )
            )
        ).scalar_one_or_none()
        if item is None:
            raise NotFoundError(
                message_key="item.unknown_code", domain="catalog",
                params={"code": payload.item_code},
            )

        order = Order(
            title=payload.title,
            item_code=payload.item_code,
            quantity=payload.quantity,
            notes=payload.notes,
            assignee_id=payload.assignee_id,
            created_by=self.principal.user_id,
            status=OrderStatus.DRAFT,
            # clan_id НЕ указываем: проставится автоматически из контекста сессии
        )
        self.session.add(order)
        try:
            await self.session.commit()
        except IntegrityError as exc:
            await self.session.rollback()
            raise ConflictError(message_key="order.duplicate", domain=DOMAIN) from exc
        await self.session.refresh(order)

        return order, self.t.t("order.created", domain=DOMAIN, title=order.title)

    async def update_order(self, order_id: uuid.UUID, payload: OrderUpdate) -> Order:
        order = await self._get_scoped(
            Order, order_id, not_found_key="order.not_found", domain=DOMAIN,
            params={"order_id": str(order_id)}, for_update=True,
        )
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(order, field, value)
        await self.session.commit()
        await self.session.refresh(order)
        return order

    async def change_status(self, order_id: uuid.UUID, payload: OrderStatusUpdate) -> tuple[Order, str]:
        order = await self._get_scoped(
            Order, order_id, not_found_key="order.not_found", domain=DOMAIN,
            params={"order_id": str(order_id)}, for_update=True,
        )
        if payload.status not in ALLOWED_TRANSITIONS[order.status]:
            raise ConflictError(
                message_key="order.invalid_transition", domain=DOMAIN,
                params={"from_status": order.status.value, "to_status": payload.status.value},
            )

        if payload.status is OrderStatus.IN_PROGRESS:
            await self._assert_stock(order)

        order.status = payload.status
        await self.session.commit()
        await self.session.refresh(order)
        return order, self.t.t("order.status_changed", domain=DOMAIN, status=order.status.value)

    async def delete_order(self, order_id: uuid.UUID) -> None:
        order = await self._get_scoped(
            Order, order_id, not_found_key="order.not_found", domain=DOMAIN,
            params={"order_id": str(order_id)},
        )
        await self.session.delete(order)   # before_flush ещё раз сверит clan_id
        await self.session.commit()

    # ---------------- internals ------------------------------------------- #
    async def _assert_stock(self, order: Order) -> None:
        """Пример доменной ошибки с параметрами в трёх локалях."""
        available = int(
            (
                await self.session.execute(
                    self._scoped(
                        select(func.coalesce(func.sum(StockpileItem.quantity), 0)),
                        StockpileItem,
                    ).where(StockpileItem.item_code == order.item_code)
                )
            ).scalar_one()
        )

        if available < order.quantity:
            raise ConflictError(
                message_key="order.not_enough_stock", domain=DOMAIN,
                params={"item": order.item_code, "needed": order.quantity, "available": available},
            )
