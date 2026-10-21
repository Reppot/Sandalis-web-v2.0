"""Официальный Foxhole War API: регионы текущей войны, города и их владельцы.

Источник — https://github.com/clapfoot/warapi (публичный, без ключа). Данные кешируются
в памяти процесса и запрашиваются с ETag (If-None-Match -> 304), как просит README:
статическая карта (названия городов и координаты) — раз в 6 часов, динамическая
(владельцы, постройки) — не чаще раза в минуту, список регионов — раз в час.

Постройки (mapItems) привязываются к ближайшему подписанному городу (mapTextItems):
ратуша/реликвия/крепость дают владельца и флаг «город победы», депо/порт/заводы —
список объектов города.
"""
from __future__ import annotations

import asyncio
import functools
import json
import math
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Final

import httpx

API_ROOT: Final[str] = "https://war-service-live.foxholeservices.com/api/worldconquest"
STATIC_TTL: Final[int] = 6 * 3600
DYNAMIC_TTL: Final[int] = 60
MAPS_TTL: Final[int] = 3600
# объект дальше этого (в долях карты региона) к городу не относится
NEAR: Final[float] = 0.12

# iconType -> ключ постройки города (README War API, «Map Icons»)
TOWN_HALLS: Final[frozenset[int]] = frozenset({56, 57, 58, 45, 46, 47, 27})
FACILITIES: Final[dict[int, str]] = {
    33: "storage", 52: "seaport", 17: "refinery", 34: "factory", 51: "mpf", 11: "hospital",
    12: "garage", 18: "shipyard", 39: "construction_yard", 19: "engineering", 37: "rocket_site",
    60: "intel", 83: "weather", 88: "aircraft_depot", 89: "aircraft_factory",
}
FLAG_VICTORY: Final[int] = 0x01
FLAG_SCORCHED: Final[int] = 0x10
TEAMS: Final[dict[str, str]] = {"WARDENS": "wardens", "COLONIALS": "colonials"}


def region_slug(name: str) -> str:
    return re.sub(r"[^a-z]", "", name.lower())


@functools.cache
def _known_names() -> dict[str, str]:
    """Принятые в игре написания регионов (seed content, kind=region): Deadlands, Allod's Bight."""
    path = Path(__file__).resolve().parents[1] / "seed/data/content.json"
    rows = json.loads(path.read_text(encoding="utf-8"))
    return {region_slug(r["payload"]["name"]): r["payload"]["name"] for r in rows if r.get("kind") == "region"}


def region_name(key: str) -> str:
    """DeadLandsHex -> Deadlands (по справочнику), новый регион -> разбивка CamelCase."""
    base = re.sub(r"Hex$", "", key)
    return _known_names().get(region_slug(base)) or re.sub(r"(?<=[a-z])(?=[A-Z])", " ", base)


@dataclass
class _Cached:
    data: Any = None
    etag: str | None = None
    fetched: float = 0.0


@dataclass
class _Cache:
    entries: dict[str, _Cached] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_cache = _Cache()


def get_http_client() -> httpx.AsyncClient:
    """Фабрика клиента — тесты подменяют её (monkeypatch)."""
    return httpx.AsyncClient(timeout=15, headers={"User-Agent": "SindarisTerminal/2.0"})


async def _get(client: httpx.AsyncClient, path: str, ttl: int) -> Any:
    entry = _cache.entries.setdefault(path, _Cached())
    if entry.data is not None and time.monotonic() - entry.fetched < ttl:
        return entry.data
    headers = {"If-None-Match": entry.etag} if entry.etag else {}
    try:
        r = await client.get(f"{API_ROOT}{path}", headers=headers)
    except httpx.HTTPError:
        if entry.data is not None:
            return entry.data            # War API недоступен — отдаём последнее известное
        raise
    if r.status_code == 304 and entry.data is not None:
        entry.fetched = time.monotonic()
        return entry.data
    r.raise_for_status()
    entry.data, entry.etag, entry.fetched = r.json(), r.headers.get("ETag"), time.monotonic()
    return entry.data


def _towns(static: dict[str, Any], dynamic: dict[str, Any]) -> list[dict[str, Any]]:
    towns = [
        {"name": t["text"], "major": t.get("mapMarkerType") == "Major", "x": round(float(t["x"]), 4),
         "y": round(float(t["y"]), 4), "owner": None, "victory": False, "scorched": False, "facilities": []}
        for t in static.get("mapTextItems") or [] if t.get("text")
    ]
    if not towns:
        return []
    for item in dynamic.get("mapItems") or []:
        icon = int(item.get("iconType") or 0)
        if icon not in TOWN_HALLS and icon not in FACILITIES:
            continue
        x, y = float(item.get("x", 0)), float(item.get("y", 0))
        # ратуша — у ближайшего крупного города, постройка — у ближайшего любого
        pool = [t for t in towns if t["major"]] if icon in TOWN_HALLS else towns
        town = min(pool or towns, key=lambda t: math.hypot(t["x"] - x, t["y"] - y))
        if math.hypot(town["x"] - x, town["y"] - y) > NEAR:
            continue
        if icon in TOWN_HALLS:
            flags = int(item.get("flags") or 0)
            town["owner"] = TEAMS.get(str(item.get("teamId")), "neutral")
            town["victory"] = town["victory"] or bool(flags & FLAG_VICTORY)
            town["scorched"] = town["scorched"] or bool(flags & FLAG_SCORCHED)
        elif FACILITIES[icon] not in town["facilities"]:
            town["facilities"].append(FACILITIES[icon])
    return sorted(towns, key=lambda t: (not t["major"], t["name"]))


async def world_regions() -> dict[str, Any]:
    """Регионы текущей войны с городами. Кеш общий для всех пользователей процесса."""
    async with _cache.lock, get_http_client() as client:
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
            towns = _towns(static, dynamic)
            owners = [t["owner"] for t in towns if t["major"] and t["owner"]]
            return {
                "key": key,
                "name": region_name(key),
                "towns": towns,
                "colonials": owners.count("colonials"),
                "wardens": owners.count("wardens"),
                "victory": sum(1 for t in towns if t["victory"]),
            }

        regions = [r for r in await asyncio.gather(*(one(k) for k in maps or [])) if r]
    regions.sort(key=lambda r: r["name"])
    victory = {"colonials": 0, "wardens": 0}
    for r in regions:
        for t in r["towns"]:
            if t["victory"] and t["owner"] in victory:
                victory[t["owner"]] += 1
    return {
        "war": {
            "number": war.get("warNumber"),
            "winner": war.get("winner"),
            "required_victory_towns": war.get("requiredVictoryTowns"),
            "started_at": war.get("conquestStartTime"),
            "victory_towns": victory,
        },
        "regions": regions,
        "source": "https://war-service-live.foxholeservices.com",
    }


def reset_cache() -> None:
    _cache.entries.clear()
