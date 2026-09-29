# app/schemas/order.py — контракт с фронтом: валидирует вход,
# сам описывает OpenAPI. Ничего лишнего, никаких полей БД наружу.
from datetime import datetime

from pydantic import BaseModel, Field


class OrderCreate(BaseModel):
    item_id: int
    quantity: int = Field(gt=0, le=100_000)
    comment: str | None = None


class OrderOut(BaseModel):
    id: int
    item_id: int
    quantity: int
    status: str
    deadline: datetime

    model_config = {"from_attributes": True}
