from pydantic import Field

from app.schemas.auth import APIModel


class ItemResponse(APIModel):
    id: str
    code: str
    name: str
    english_name: str
    category: str
    icon_url: str | None
    crate_size: int
    production_time: int


class ItemListQuery(APIModel):
    query: str = ""
    category: str | None = None
    limit: int = Field(default=200, ge=1, le=5000)