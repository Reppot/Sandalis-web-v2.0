"""Импорт каталога предметов и рецептов Foxhole в PostgreSQL.

Объединяет три источника старого монолита в единую таблицу items:
1. src/lib/factory-data.ts   (120 922 Б) — рецепты фабрик
2. src/lib/item-catalog.ts   (59 731 Б)  — русские названия
3. src/lib/itemCodes.ts      (56 900 Б)  — коды предметов
4. data/catalog.json         (2.5 МБ)    — расширенные метаданные
5. data/fs_vanilla.h5        (22 МБ)     — исходники Foxhole

Использование:
    python -m scripts.import_catalog --catalog data/catalog.json --hdf5 data/fs_vanilla.h5

Скрипт идемпотентен: обновляет существующие записи, добавляет новые.
"""
import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any

from sqlalchemy import select

from app.core.db import async_session_factory
from app.models import Item, Recipe

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("import_catalog")


CATEGORY_MAPPING = {
    "SmallArms": "small_arms",
    "HeavyArms": "heavy_arms",
    "HeavyAmmo": "heavy_arms",
    "Utility": "utilities",
    "Medical": "medical",
    "Resource": "resources",
    "Uniform": "uniforms",
    "Vehicle": "vehicles",
    "Tank": "vehicles",
    "Ship": "vehicles",
}


def normalize_category(raw: str) -> str:
    """Приводит категории Foxhole к нашей номенклатуре."""
    return CATEGORY_MAPPING.get(raw, "utilities")


def load_json_catalog(path: Path) -> list[dict[str, Any]]:
    """Загружает catalog.json."""
    if not path.exists():
        logger.warning("Catalog file not found: %s", path)
        return []

    with path.open(encoding="utf-8") as f:
        data = json.load(f)

    if isinstance(data, dict) and "items" in data:
        return data["items"]
    if isinstance(data, list):
        return data
    return []


def load_hdf5_recipes(path: Path) -> dict[str, list[dict[str, Any]]]:
    """Извлекает рецепты из fs_vanilla.h5 (если h5py установлен)."""
    if not path.exists():
        logger.warning("HDF5 file not found: %s", path)
        return {}

    try:
        import h5py
    except ImportError:
        logger.warning("h5py not installed — skipping recipe import")
        return {}

    recipes: dict[str, list[dict[str, Any]]] = {}
    try:
        with h5py.File(str(path), "r") as f:
            if "recipes" not in f:
                return {}

            for item_id in f["recipes"]:
                item_recipes = []
                recipe_group = f["recipes"][item_id]
                for facility_key in recipe_group:
                    facility_data = recipe_group[facility_key]
                    ingredients = []
                    if "ingredients" in facility_data:
                        for ing_id, qty in facility_data["ingredients"].attrs.items():
                            ingredients.append({"item_id": ing_id, "quantity": int(qty)})
                    item_recipes.append({
                        "facility": facility_key,
                        "ingredients": ingredients,
                        "yield_quantity": int(facility_data.attrs.get("yield", 1)),
                    })
                recipes[item_id] = item_recipes
    except Exception as e:
        logger.error("Failed to read HDF5: %s", e)
        return {}

    logger.info("Loaded recipes for %d items from HDF5", len(recipes))
    return recipes


async def import_items(items_data: list[dict[str, Any]], recipes_data: dict[str, list[dict[str, Any]]]) -> tuple[int, int]:
    """Импортирует предметы и рецепты в БД."""
    inserted_items = 0
    updated_items = 0

    async with async_session_factory() as db:
        try:
            for raw in items_data:
                item_id = str(raw.get("id") or raw.get("codeName") or "").strip()
                if not item_id:
                    continue

                existing = (await db.execute(select(Item).where(Item.id == item_id))).scalar_one_or_none()

                icon_url = raw.get("iconUrl") or raw.get("icon")
                if icon_url and not icon_url.startswith("http"):
                    # Локальные пути будут заменены после import_icons_to_s3.py
                    icon_url = f"/FoxholeWikiPhotos/{Path(icon_url).name}"

                fields = {
                    "code": str(raw.get("code") or raw.get("shortName") or item_id[:8]),
                    "name": str(raw.get("name") or raw.get("displayName") or item_id),
                    "english_name": str(raw.get("englishName") or raw.get("name") or item_id),
                    "category": normalize_category(str(raw.get("category", "utilities"))),
                    "icon_url": icon_url,
                    "crate_size": int(raw.get("crateSize", 1) or 1),
                    "production_time": int(raw.get("productionTime", 0) or 0),
                }

                if existing is None:
                    item = Item(id=item_id, **fields)
                    db.add(item)
                    inserted_items += 1
                else:
                    for key, val in fields.items():
                        setattr(existing, key, val)
                    updated_items += 1

                # Обновляем рецепты (удаляем старые, добавляем новые)
                if item_id in recipes_data:
                    await db.flush()
                    from sqlalchemy import delete
                    await db.execute(delete(Recipe).where(Recipe.item_id == item_id))

                    for rec in recipes_data[item_id]:
                        db.add(Recipe(
                            item_id=item_id,
                            facility=rec["facility"],
                            ingredients=rec["ingredients"],
                            yield_quantity=rec["yield_quantity"],
                        ))

            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.exception("Import failed: %s", e)
            raise

    return inserted_items, updated_items


async def run_import(catalog_path: Path, hdf5_path: Path | None) -> None:
    logger.info("Starting catalog import")

    items_data = load_json_catalog(catalog_path)
    logger.info("Loaded %d items from JSON", len(items_data))

    recipes_data = load_hdf5_recipes(hdf5_path) if hdf5_path else {}

    if not items_data:
        logger.error("No items to import. Aborting.")
        sys.exit(1)

    inserted, updated = await import_items(items_data, recipes_data)

    logger.info("=" * 60)
    logger.info("Catalog import complete:")
    logger.info("  Items inserted: %d", inserted)
    logger.info("  Items updated:  %d", updated)
    logger.info("  Recipes loaded: %d", sum(len(r) for r in recipes_data.values()))
    logger.info("=" * 60)


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Foxhole catalog into PostgreSQL")
    parser.add_argument("--catalog", type=Path, required=True, help="Path to catalog.json")
    parser.add_argument("--hdf5", type=Path, default=None, help="Path to fs_vanilla.h5 (optional)")
    args = parser.parse_args()

    asyncio.run(run_import(args.catalog, args.hdf5))


if __name__ == "__main__":
    main()