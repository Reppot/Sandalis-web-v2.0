"""Карта мира для «Планирования»: гексы текущей войны и ключевые постройки (Foxhole War API).

Снимок собирается раз в сутки и живёт в памяти процесса: планированию нужна общая картина
(ратуши, реликвии, склады, порты, береговые орудия, аэродромы), а не обновление раз в минуту.
Если War API недоступен, отдаётся прошлый снимок, а новая попытка — не раньше чем через 10 минут.

Между войнами идёт «сопротивление»: пару дней War API отдаёт постройки совсем другой карты,
которые не совпадают с картинками гексов. В это время построек нет — только гексы и города,
а снимок перепроверяется каждый час, чтобы не пропустить начало новой войны.

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
RESISTANCE_TTL: Final[int] = 3600
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
_overview_snap = _Snapshot()
_lock = asyncio.Lock()


def is_resistance(war: dict[str, Any], now_ms: int) -> bool:
    """Война закончилась (есть победитель) или наступило время сопротивления."""
    if str(war.get("winner") or "NONE") != "NONE":
        return True
    start = war.get("resistanceStartTime")
    return bool(start) and now_ms >= int(start)


def _clamp(v: Any) -> float:
    return round(min(1.0, max(0.0, float(v or 0))), 4)


def _region(key: str, static: dict[str, Any], dynamic: dict[str, Any], resistance: bool) -> dict[str, Any] | None:
    slug = map_slug(key)
    if slug not in GRID:
        return None
    col, row = GRID[slug]
    items = []
    for it in [] if resistance else dynamic.get("mapItems") or []:
        kind = KINDS.get(int(it.get("iconType") or 0))
        if not kind:
            continue
        flags = int(it.get("flags") or 0)
        items.append({
            "kind": kind[0], "tier": kind[1],
            "team": TEAMS.get(str(it.get("teamId")), "neutral"),
            "x": _clamp(it.get("x")), "y": _clamp(it.get("y")),
            "victory": bool(flags & FLAG_VICTORY), "scorched": bool(flags & FLAG_SCORCHED),
        })
    labels = [
        {"text": t["text"], "x": _clamp(t.get("x")), "y": _clamp(t.get("y")), "major": t.get("mapMarkerType") == "Major"}
        for t in static.get("mapTextItems") or [] if t.get("text")
    ]
    return {"key": key, "slug": slug, "name": region_name(key), "col": col, "row": row, "items": items, "labels": labels}


async def _build() -> dict[str, Any]:
    async with get_http_client() as client:
        war = await _get(client, "/war", MAPS_TTL)
        maps = await _get(client, "/maps", MAPS_TTL)
        resistance = is_resistance(war, int(time.time() * 1000))
        sem = asyncio.Semaphore(8)

        async def one(key: str) -> dict[str, Any] | None:
            async with sem:
                try:
                    static = await _get(client, f"/maps/{key}/static", STATIC_TTL)
                    dynamic = await _get(client, f"/maps/{key}/dynamic/public", DYNAMIC_TTL)
                except (httpx.HTTPError, ValueError):
                    return None
            return _region(key, static, dynamic, resistance)

        regions = [r for r in await asyncio.gather(*(one(k) for k in maps or [])) if r]
    if not regions:
        raise ValueError("War API: нет ни одного региона")
    now = datetime.now(UTC)
    return {
        "war_number": war.get("warNumber"),
        "phase": "resistance" if resistance else "conquest",
        "winner": TEAMS.get(str(war.get("winner"))),
        "updated_at": now.isoformat(),
        "next_update_at": (now + timedelta(seconds=RESISTANCE_TTL if resistance else SNAPSHOT_TTL)).isoformat(),
        "regions": sorted(regions, key=lambda r: (r["row"], r["col"])),
        "source": "https://war-service-live.foxholeservices.com",
    }


async def _build_overview() -> dict[str, Any]:
    """Карта-контекст без объектов: динамику регионов загружаем только по запросу выбора."""
    async with get_http_client() as client:
        war = await _get(client, "/war", MAPS_TTL)
        maps = await _get(client, "/maps", MAPS_TTL)
        resistance = is_resistance(war, int(time.time() * 1000))
        sem = asyncio.Semaphore(8)

        async def one(key: str) -> dict[str, Any] | None:
            async with sem:
                try:
                    static = await _get(client, f"/maps/{key}/static", STATIC_TTL)
                except (httpx.HTTPError, ValueError):
                    return None
            return _region(key, static, {}, True)

        regions = [r for r in await asyncio.gather(*(one(k) for k in maps or [])) if r]
    if not regions:
        raise ValueError("War API: нет ни одного региона")
    now = datetime.now(UTC)
    return {
        "war_number": war.get("warNumber"),
        "phase": "resistance" if resistance else "conquest",
        "winner": TEAMS.get(str(war.get("winner"))),
        "updated_at": now.isoformat(),
        "next_update_at": (now + timedelta(seconds=RESISTANCE_TTL if resistance else SNAPSHOT_TTL)).isoformat(),
        "regions": sorted(regions, key=lambda r: (r["row"], r["col"])),
        "source": "https://war-service-live.foxholeservices.com",
    }


async def world_map_overview() -> dict[str, Any]:
    """Overview содержит только геометрию и подписи; динамические объекты не загружаются."""
    async with _lock:
        now = time.monotonic()
        ttl = RESISTANCE_TTL if _overview_snap.data is not None and _overview_snap.data["phase"] == "resistance" else SNAPSHOT_TTL
        if _overview_snap.data is not None and (
            now - _overview_snap.built < ttl or (_overview_snap.failed is not None and now - _overview_snap.failed < RETRY_AFTER)
        ):
            return _overview_snap.data
        try:
            _overview_snap.data, _overview_snap.built, _overview_snap.failed = await _build_overview(), now, None
        except (httpx.HTTPError, ValueError):
            if _overview_snap.data is None:
                raise
            _overview_snap.failed = now
        return _overview_snap.data


async def world_map_regions(keys: list[str]) -> dict[str, Any]:
    """Возвращает постройки только для запрошенных гексов; остальные не опрашиваются."""
    overview = await world_map_overview()
    wanted = set(keys)
    available = {region["key"]: region for region in overview["regions"] if region["key"] in wanted}
    if not available or overview["phase"] == "resistance":
        return {**overview, "regions": list(available.values())}

    async with get_http_client() as client:
        sem = asyncio.Semaphore(8)

        async def load(key: str) -> dict[str, Any]:
            async with sem:
                dynamic = await _get(client, f"/maps/{key}/dynamic/public", DYNAMIC_TTL)
            base = available[key]
            items = []
            for it in dynamic.get("mapItems") or []:
                kind = KINDS.get(int(it.get("iconType") or 0))
                if not kind:
                    continue
                flags = int(it.get("flags") or 0)
                items.append({
                    "kind": kind[0], "tier": kind[1],
                    "team": TEAMS.get(str(it.get("teamId")), "neutral"),
                    "x": _clamp(it.get("x")), "y": _clamp(it.get("y")),
                    "victory": bool(flags & FLAG_VICTORY), "scorched": bool(flags & FLAG_SCORCHED),
                })
            return {**base, "items": items}

        details = await asyncio.gather(*(load(key) for key in available))
    return {**overview, "regions": details}


async def world_frontline() -> list[dict[str, float]]:
    """Агрегирует позицию фронта и отдаёт только координаты линии, без маркеров построек."""
    snapshot = await world_map()
    points = [
        {
            "team": item["team"],
            "x": region["col"] * 1024 * 0.75 + item["x"] * 1024,
            "y": region["row"] * 888 / 2 + item["y"] * 888,
        }
        for region in snapshot["regions"]
        for item in region["items"]
        if item["kind"] == "town_hall" and item["team"] != "neutral"
    ]
    wardens = [p for p in points if p["team"] == "wardens"]
    colonials = [p for p in points if p["team"] == "colonials"]
    if not wardens or not colonials:
        return []

    midpoints = []
    for warden in wardens:
        colonial = min(colonials, key=lambda p: (p["x"] - warden["x"]) ** 2 + (p["y"] - warden["y"]) ** 2)
        midpoints.append({"x": (warden["x"] + colonial["x"]) / 2, "y": (warden["y"] + colonial["y"]) / 2})
    cx = sum(p["x"] for p in points) / len(points)
    cy = sum(p["y"] for p in points) / len(points)
    wx = sum(p["x"] for p in wardens) / len(wardens)
    wy = sum(p["y"] for p in wardens) / len(wardens)
    ox = sum(p["x"] for p in colonials) / len(colonials) - wx
    oy = sum(p["y"] for p in colonials) / len(colonials) - wy
    midpoints.sort(key=lambda p: (p["x"] - cx) * -oy + (p["y"] - cy) * ox)
    return midpoints


async def world_map() -> dict[str, Any]:
    """Суточный снимок карты; при сбое War API — прошлый снимок, если он есть."""
    async with _lock:
        now = time.monotonic()
        ttl = RESISTANCE_TTL if _snap.data is not None and _snap.data["phase"] == "resistance" else SNAPSHOT_TTL
        if _snap.data is not None and (
            now - _snap.built < ttl or (_snap.failed is not None and now - _snap.failed < RETRY_AFTER)
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
    _overview_snap.data, _overview_snap.built, _overview_snap.failed = None, 0.0, None
