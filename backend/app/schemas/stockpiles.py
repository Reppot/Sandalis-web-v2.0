from datetime import datetime

from pydantic import Field

from app.schemas.auth import APIModel


class StockpileItemInput(APIModel):
    item_id: str = Field(min_length=1, max_length=128)
    quantity: int = Field(ge=0)


class CreateStockpileRequest(APIModel):
    name: str = Field(min_length=1, max_length=255)
    location: str = Field(min_length=1, max_length=255)
    code: str | None = Field(default=None, max_length=64)
    items: list[StockpileItemInput] = Field(default_factory=list)


class UpdateStockpileItemsRequest(APIModel):
    items: list[StockpileItemInput] = Field(default_factory=list)


class StockpileItemResponse(APIModel):
    item_id: str
    quantity: int


class StockpileResponse(APIModel):
    id: str
    name: str
    location: str
    code: str | None
    items: list[StockpileItemResponse]
    last_updated_by: str | None
    updated_at: datetime