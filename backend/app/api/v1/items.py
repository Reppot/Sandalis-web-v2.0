from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models.item import Item
from app.schemas.items import ItemResponse
from app.services.items import item_service


router = APIRouter(
    prefix="/items",
    tags=["items"],
)


def _serialize_item(item: Item) -> ItemResponse:
    return ItemResponse(
        id=item.id,
        code=item.code,
        name=item.name,
        english_name=item.english_name,
        category=item.category,
        icon_url=item.icon_url,
        crate_size=item.crate_size,
        production_time=item.production_time,
    )


@router.get("", response_model=list[ItemResponse])
async def list_items(
    query: str = "",
    category: str | None = None,
    limit: int = 200,
    db: AsyncSession = Depends(get_db),
) -> list[ItemResponse]:
    safe_limit = max(1, min(limit, 5000))

    items = await item_service.search(
        db=db,
        query=query,
        category=category,
        limit=safe_limit,
    )

    return [_serialize_item(item) for item in items]