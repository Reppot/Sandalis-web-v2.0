from typing import cast

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.catalog.search import search_catalog
from app.domain.catalog.types import DomainItem, ItemCategory
from app.models.item import Item


class ItemService:
    async def search(
        self,
        db: AsyncSession,
        query: str = "",
        category: str | None = None,
        limit: int = 200,
    ) -> list[Item]:
        result = await db.execute(
            select(Item).order_by(Item.name.asc())
        )

        database_items = list(result.scalars().all())

        domain_items = [
            DomainItem(
                id=item.id,
                code=item.code,
                name=item.name,
                english_name=item.english_name,
                category=cast(ItemCategory, item.category),
                icon_url=item.icon_url,
                crate_size=item.crate_size,
                production_time=item.production_time,
            )
            for item in database_items
        ]

        search_category: ItemCategory | str = (
            category if category is not None else "all"
        )

        filtered_items = search_catalog(
            items=domain_items,
            query=query,
            category=cast(
                ItemCategory | object,
                search_category,
            ),
        )

        filtered_ids = {item.id for item in filtered_items}

        entities = [
            item
            for item in database_items
            if item.id in filtered_ids
        ]

        entity_by_id = {
            item.id: item
            for item in entities
        }

        return [
            entity_by_id[item.id]
            for item in filtered_items[:limit]
            if item.id in entity_by_id
        ]


item_service = ItemService()