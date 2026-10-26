"""Карта мира для «Планирования»: гексы текущей войны и ключевые постройки (Foxhole War API).

Снимок собирается раз в сутки и живёт в памяти процесса: планированию нужна общая картина
(ратуши, реликвии, склады, порты, береговые орудия, аэродромы), а не обновление раз в минуту.
Если War API недоступен, отдаётся прошлый снимок, а новая попытка — не раньше чем через 10 минут.

Раскладка гексов: колонка x и полу-ряд y сетки «плоских» шестиугольников (как в игре и на
foxholestats.com). Картинки регионов — Images/Maps из репозитория War API, сжатые в
static/maps/hex/<slug>.webp.
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Final

import httpx

from app.services.war_api import DYNAMIC_TTL, MAPS_TTL, STATIC_TTL, TEAMS, _get, get_http_client, region_name, region_slug

SNAPSHOT_TTL: Final[int] = 24 * 3600
RETRY_AFTER: Final[int] = 600
FLAG_VICTORY: Final[int] = 0x01
FLAG_SCORCHED: Final[int] = 0x10

# iconType -> (вид постройки, уровень); README War API, «Map Icons»
KINDS: Final[dict[int, tuple[str, int | None]]] = {
    56: ("town_hall", 1), 57: ("town_hall", 2), 58: ("town_hall", 3),
    45: ("relic", 1), 46: ("relic", 2), 47: ("relic", 3),
    33: ("storage", None),
    52: ("seaport", None),
    53: ("coastal_gun", None),
    91: ("runway", 1), 92: ("runway", 2),
}
# маяки и зенитки War API не публикует — фильтр есть, данных нет
UNAVAILABLE: Final[tuple[str, ...]] = ("lighthouse", "aa_gun")

# slug региона -> (колонка, полу-ряд)
GRID: Final[dict[str, tuple[int, int]]] = {
    "basinsionnach": (6, 0), "speakingwoods": (5, 1), "howlcounty": (7, 1), "kuurastrand": (2, 2),
    "callumscape": (4, 2), "reachingtrail": (6, 2), "clansheadvalley": (8, 2), "paripeak": (1, 3),
    "nevishline": (3, 3), "mooringcounty": (5, 3), "viperpit": (7, 3), "morgenscrossing": (9, 3),
    "olaviswake": (0, 4), "gutter": (2, 4), "stonecradle": (4, 4), "callahanspassage": (6, 4),
    "weatheredexpanse": (8, 4), "godcrofts": (10, 4), "palantineberm": (1, 5), "farranaccoast": (3, 5),
    "linnmercy": (5, 5), "marbanhollow": (7, 5), "stlicanshelf": (9, 5), "lykosisle": (11, 5),
    "fishermansrow": (2, 6), "kingscage": (4, 6), "deadlands": (6, 6), "clahstra": (8, 6),
    "tempestisland": (10, 6), "oarbreaker": (1, 7), "westgate": (3, 7), "lochmor": (5, 7),
    "drownedvale": (7, 7), "endlessshore": (9, 7), "thefingers": (11, 7), "stemalanding": (2, 8),
    "sableport": (4, 8), "umbralwildwood": (6, 8), "allodsbight": (8, 8), "wresta": (10, 8),
    "pipersenclave": (12, 8), "origin": (3, 9), "heartlands": (5, 9), "shackledchasm": (7, 9),
    "reaverspass": (9, 9), "tyrantfoothills": (11, 9), "ashfields": (4, 10), "greatmarch": (6, 10),
    "terminus": (8, 10), "onyx": (10, 10), "redriver": (5, 11), "acrithia": (7, 11), "kalokai": (6, 12),
}


def map_slug(key: str) -> str:
    """DeadLandsHex -> deadlands (имя картинки и ключ раскладки)."""
    return region_slug(key.removesuffix("Hex"))


@dataclass
class _Snapshot:
    data: dict[str, Any] | None = None
    built: float = 0.0
    failed: float | None = None


_snap = _Snapshot()
_lock = asyncio.Lock()


def _region(key: str, static: dict[str, Any], dynamic: dict[str, Any]) -> dict[str, Any] | None:
    slug = map_slug(key)
    if slug not in GRID:
        return None
    col, row = GRID[slug]
    items = []
    for it in dynamic.get("mapItems") or []:
        kind = KINDS.get(int(it.get("iconType") or 0))
        if not kind:
            continue
        flags = int(it.get("flags") or 0)
        items.append({
            "kind": kind[0], "tier": kind[1],
            "team": TEAMS.get(str(it.get("teamId")), "neutral"),
            "x": round(float(it.get("x", 0)), 4), "y": round(float(it.get("y", 0)), 4),
            "victory": bool(flags & FLAG_VICTORY), "scorched": bool(flags & FLAG_SCORCHED),
        })
    labels = [
        {"text": t["text"], "x": round(float(t["x"]), 4), "y": round(float(t["y"]), 4)}
        for t in static.get("mapTextItems") or [] if t.get("text") and t.get("mapMarkerType") == "Major"
    ]
    return {"key": key, "slug": slug, "name": region_name(key), "col": col, "row": row, "items": items, "labels": labels}


async def _build() -> dict[str, Any]:
    async with get_http_client() as client:
        war = await _get(client, "/war", MAPS_TTL)
        maps = await _get(client, "/maps", MAPS_TTL)
        sem = asyncio.Semaphore(8)

        async def one(key: str) -> dict[str, Any] | None:
            async with sem:
                try:
                    static = await _get(client, f"/maps/{key}/static", STATIC_TTL)
                    dynamic = await _get(client, f"/maps/{key}/dynamic/public", DYNAMIC_TTL)
                except (httpx.HTTPError, ValueError):
                    return None
            return _region(key, static, dynamic)

        regions = [r for r in await asyncio.gather(*(one(k) for k in maps or [])) if r]
    if not regions:
        raise ValueError("War API: нет ни одного региона")
    now = datetime.now(UTC)
    return {
        "war_number": war.get("warNumber"),
        "updated_at": now.isoformat(),
        "next_update_at": (now + timedelta(seconds=SNAPSHOT_TTL)).isoformat(),
        "unavailable": list(UNAVAILABLE),
        "regions": sorted(regions, key=lambda r: (r["row"], r["col"])),
        "source": "https://war-service-live.foxholeservices.com",
    }


async def world_map() -> dict[str, Any]:
    """Суточный снимок карты; при сбое War API — прошлый снимок, если он есть."""
    async with _lock:
        now = time.monotonic()
        if _snap.data is not None and (
            now - _snap.built < SNAPSHOT_TTL or (_snap.failed is not None and now - _snap.failed < RETRY_AFTER)
        ):
            return _snap.data
        try:
            _snap.data, _snap.built, _snap.failed = await _build(), now, None
        except (httpx.HTTPError, ValueError):
            if _snap.data is None:
                raise
            _snap.failed = now
        return _snap.data


def reset_snapshot() -> None:
    _snap.data, _snap.built, _snap.failed = None, 0.0, None
