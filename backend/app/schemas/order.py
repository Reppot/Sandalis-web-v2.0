from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.models.order import OrderStatus
from app.schemas.common import Page  # noqa: F401  (ре-экспорт для обратной совместимости)


class OrderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: Annotated[str, Field(min_length=1, max_length=120)]
    item_code: Annotated[str, Field(min_length=1, max_length=64)]
    quantity: Annotated[int, Field(gt=0, le=1_000_000)]
    notes: Annotated[str | None, Field(default=None, max_length=2000)]
    assignee_id: Annotated[str | None, Field(default=None, max_length=64)]


class OrderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: Annotated[str | None, Field(default=None, min_length=1, max_length=120)]
    quantity: Annotated[int | None, Field(default=None, gt=0, le=1_000_000)]
    produced: Annotated[int | None, Field(default=None, ge=0)]
    notes: Annotated[str | None, Field(default=None, max_length=2000)]
    assignee_id: Annotated[str | None, Field(default=None, max_length=64)]


class OrderStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: OrderStatus


class OrderRead(BaseModel):
    # clan_id НЕ отдаём наружу — внутренний дискриминатор аренды
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    status: OrderStatus
    item_code: str
    quantity: int
    produced: int
    notes: str | None
    created_by: str
    assignee_id: str | None
    created_at: datetime
    updated_at: datetime


class OrderCreated(BaseModel):
    order: OrderRead
    message: str          # локализованное уведомление для тоста во фронте
