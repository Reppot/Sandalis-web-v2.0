from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.auth import APIModel


OrderStatus = Literal[
    "pending",
    "processing",
    "completed",
    "cancelled",
]


class OrderItemCreate(APIModel):
    item_id: str = Field(min_length=1, max_length=128)
    quantity: int = Field(ge=1)
    completed_quantity: int = Field(default=0, ge=0)


class OrderCreateRequest(APIModel):
    items: list[OrderItemCreate] = Field(min_length=1)
    destination: str = Field(min_length=1, max_length=255)
    notes: str | None = Field(default=None, max_length=5000)


class OrderStatusUpdateRequest(APIModel):
    status: OrderStatus


class OrderItemResponse(APIModel):
    item_id: str
    quantity: int
    completed_quantity: int


class OrderResponse(APIModel):
    id: str
    creator_id: str | None
    assignee_id: str | None
    status: OrderStatus
    items: list[OrderItemResponse]
    destination: str
    notes: str | None
    created_at: datetime
    updated_at: datetime