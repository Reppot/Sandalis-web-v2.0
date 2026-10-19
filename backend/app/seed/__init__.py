"""
Идемпотентная заливка справочников из app/seed/data/*.json.

* catalog_items и production_recipes — данные игры: перезаписываются сидом
  (обновление номенклатуры = новый JSON + повторный запуск);
* app_content — только добавляются недостающие записи: правки, сделанные через
  API (например, новый URL видео входа), сид не затирает.

Запуск: `python -m app.seed` (Render делает это после `alembic upgrade head`).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncConnection

from app.models.catalog import CatalogItem
from app.models.content import AppContent
from app.models.recipe import ProductionRecipe

DATA_DIR = Path(__file__).resolve().parent / "data"
BATCH = 200


def load(name: str) -> list[dict[str, Any]]:
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


def _chunks(rows: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    return [rows[i:i + BATCH] for i in range(0, len(rows), BATCH)]


async def seed_catalog(conn: AsyncConnection, rows: list[dict[str, Any]]) -> int:
    for chunk in _chunks(rows):
        stmt = insert(CatalogItem).values([{**row, "is_active": True} for row in chunk])
        await conn.execute(stmt.on_conflict_do_update(
            index_elements=[CatalogItem.code],
            set_={
                col: stmt.excluded[col]
                for col in ("name", "english_name", "category", "faction", "origin",
                            "icon_url", "crate_size", "aliases", "needs_review")
            },
        ))
    return len(rows)


async def seed_recipes(conn: AsyncConnection, rows: list[dict[str, Any]]) -> int:
    for chunk in _chunks(rows):
        stmt = insert(ProductionRecipe).values(chunk)
        updatable = [k for k in chunk[0] if k != "id"]
        await conn.execute(stmt.on_conflict_do_update(
            index_elements=[ProductionRecipe.id],
            set_={**{col: stmt.excluded[col] for col in updatable}, "updated_at": func.now()},
        ))
    return len(rows)


async def seed_content(conn: AsyncConnection, rows: list[dict[str, Any]]) -> int:
    inserted = 0
    for chunk in _chunks(rows):
        stmt = insert(AppContent).values(chunk).on_conflict_do_nothing(
            constraint="uq_app_content_kind_key"
        )
        result = await conn.execute(stmt)
        inserted += result.rowcount or 0
    return inserted


async def run(conn: AsyncConnection) -> dict[str, int]:
    return {
        "catalog": await seed_catalog(conn, load("catalog.json")),
        "recipes": await seed_recipes(conn, load("recipes.json")),
        "content_inserted": await seed_content(conn, load("content.json")),
    }
