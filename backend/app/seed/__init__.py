"""
Идемпотентная заливка справочников из app/seed/data/*.json.

* catalog_items и production_recipes — данные игры: перезаписываются сидом
  (обновление номенклатуры = новый JSON + повторный запуск);
* app_content — только добавляются недостающие записи: правки, сделанные через
  API (например, новый URL видео входа), сид не затирает. Исключение — переводы
  en/cs (content_i18n.json → payload.i18n) и руководство «Навигация» (guide.json,
  генерирует backend/scripts/guide): системные данные, обновляются всегда.

Запуск: `python -m app.seed` (Render делает это после `alembic upgrade head`).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sqlalchemy import String, cast, delete, func, update
from sqlalchemy.dialects.postgresql import JSONB, insert
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
        # is_active: false в catalog.json — служебные записи (Unknown, legacy), скрытые из выбора
        stmt = insert(CatalogItem).values([{**row, "is_active": row.get("is_active", True)} for row in chunk])
        await conn.execute(stmt.on_conflict_do_update(
            index_elements=[CatalogItem.code],
            set_={
                col: stmt.excluded[col]
                for col in ("name", "english_name", "category", "faction", "origin",
                            "icon_url", "crate_size", "aliases", "needs_review", "is_active")
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


async def seed_facility_recipes(conn: AsyncConnection, rows: list[dict[str, Any]]) -> int:
    """Рецепты построек (wiki Production) — генерируются целиком: рецепты, которых больше
    нет на вики, удаляются."""
    await conn.execute(
        delete(ProductionRecipe).where(
            ProductionRecipe.kind == "facility", ProductionRecipe.id.not_in([r["id"] for r in rows])
        )
    )
    return await seed_recipes(conn, rows) if rows else 0


async def seed_content(conn: AsyncConnection, rows: list[dict[str, Any]]) -> int:
    inserted = 0
    for chunk in _chunks(rows):
        stmt = insert(AppContent).values(chunk).on_conflict_do_nothing(
            constraint="uq_app_content_kind_key"
        )
        result = await conn.execute(stmt)
        inserted += result.rowcount or 0
    return inserted


async def seed_content_icons(conn: AsyncConnection, rows: list[dict[str, Any]]) -> int:
    """Иконки справочников (материалы и т. п.): заполняются, только если в БД иконки нет —
    правки админа не перезаписываются."""
    updated = 0
    for row in rows:
        icon = (row.get("payload") or {}).get("icon")
        if not isinstance(icon, str) or not icon.startswith("/api/"):
            continue
        result = await conn.execute(
            update(AppContent)
            .where(
                AppContent.kind == row["kind"], AppContent.key == row["key"],
                func.coalesce(AppContent.payload["icon"].astext, "") == "",
            )
            .values(payload=AppContent.payload.op("||")(func.jsonb_build_object("icon", icon)))
        )
        updated += result.rowcount or 0
    return updated


async def seed_content_i18n(conn: AsyncConnection, i18n: dict[str, dict[str, Any]]) -> int:
    """Переводы en/cs — системные данные: payload.i18n перезаписывается всегда,
    остальные поля payload (возможно, правленые админом) не трогаются."""
    updated = 0
    for kind, entries in i18n.items():
        for key, translations in entries.items():
            result = await conn.execute(
                update(AppContent)
                .where(AppContent.kind == kind, AppContent.key == key)
                .values(payload=AppContent.payload.op("||")(
                    func.jsonb_build_object(
                        "i18n", cast(cast(json.dumps(translations, ensure_ascii=False), String), JSONB)
                    )
                ))
            )
            updated += result.rowcount or 0
    return updated


async def seed_guide(conn: AsyncConnection, rows: list[dict[str, Any]]) -> int:
    """Главы руководства перезаписываются целиком: скриншоты и метки — артефакт сборки."""
    for chunk in _chunks(rows):
        stmt = insert(AppContent).values(chunk)
        await conn.execute(stmt.on_conflict_do_update(
            constraint="uq_app_content_kind_key",
            set_={"payload": stmt.excluded.payload, "sort": stmt.excluded.sort,
                  "is_active": True, "updated_at": func.now()},
        ))
    return len(rows)


async def run(conn: AsyncConnection) -> dict[str, int]:
    return {
        "catalog": await seed_catalog(conn, load("catalog.json")),
        "recipes": await seed_recipes(conn, load("recipes.json")),
        "facility_recipes": await seed_facility_recipes(conn, load("facility_recipes.json"))
        if (DATA_DIR / "facility_recipes.json").exists() else 0,
        "content_inserted": await seed_content(conn, load("content.json")),
        "content_icons": await seed_content_icons(conn, load("content.json")),
        "content_translated": await seed_content_i18n(
            conn, json.loads((DATA_DIR / "content_i18n.json").read_text(encoding="utf-8"))
        ),
        "guide": await seed_guide(conn, load("guide.json")) if (DATA_DIR / "guide.json").exists() else 0,
    }
