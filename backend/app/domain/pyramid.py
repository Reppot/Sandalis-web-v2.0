"""Пирамида снабжения клана: что держать на складе и в каком порядке привозить.

Идея — пирамида Маслоу для логистики (как logihub.app/pyramid): уровень 1 — основа
(без неё фронт не живёт), выше — всё более специализированное. Пока нижний уровень
не закрыт, верхние не важны. Цель задаётся в ящиках на склад; фактическое
количество берётся из закреплённого склада.

Шаблон — стартовая точка: командир правит уровни, предметы и цели под свой фронт.
Предметы фракций указаны парами — в пирамиде видны только предметы выбранной
фракции и нейтральные.
"""
from __future__ import annotations

from typing import Any, Final

# (код предмета, ящиков) по уровням снизу вверх
DEFAULT_TIERS: Final[list[dict[str, Any]]] = [
    {"title": "", "items": [("SoldierSupplies", 20), ("Cloth", 30)]},
    {"title": "", "items": [
        ("RifleW", 8), ("RifleC", 8), ("RifleAmmo", 8), ("GrenadeW", 4), ("GrenadeC", 4),
        ("HEGrenade", 3), ("StickyBomb", 3), ("Shovel", 2),
    ]},
    {"title": "", "items": [
        ("Bandages", 4), ("FirstAidKit", 3), ("TraumaKit", 3), ("BloodPlasma", 3), ("GreenAsh", 3),
    ]},
    {"title": "", "items": [
        ("RpgW", 2), ("ATRPGLightC", 2), ("RpgAmmo", 4), ("SmokeGrenade", 3), ("Radio", 2),
        ("GasMask", 3), ("GasMaskFilter", 4),
    ]},
    {"title": "", "items": [
        ("AssaultRifleW", 3), ("AssaultRifleC", 3), ("AssaultRifleAmmo", 4), ("MGW", 2), ("MGC", 2),
        ("MGAmmo", 4), ("ATRifleW", 2), ("ATRifleLightC", 2), ("ATRifleAmmo", 3),
    ]},
    {"title": "", "items": [
        ("Mortar", 1), ("MortarAmmo", 4), ("MortarAmmoFL", 2), ("MortarAmmoSH", 2),
        ("WorkWrench", 2), ("Binoculars", 2), ("Tripod", 2),
    ]},
    {"title": "", "items": [
        ("SandbagMaterials", 2), ("BarbedWireMaterials", 2), ("WaterBucket", 1), ("ListeningKit", 1),
        ("LightTankAmmo", 3), ("ATAmmo", 3), ("MiniTankAmmo", 2),
    ]},
]

# Готовые конфигурации (как «Configuration» на logihub.app/pyramid) — свои, под задачи клана.
# Пирамиду клана можно собрать на основе любой из них.
PRESETS: Final[dict[str, list[dict[str, Any]]]] = {
    "normal": DEFAULT_TIERS,
    "basic": [
        {"title": "", "items": [("SoldierSupplies", 10), ("Cloth", 20)]},
        {"title": "", "items": [("RifleW", 5), ("RifleC", 5), ("RifleAmmo", 5), ("Bandages", 3), ("FirstAidKit", 2)]},
        {"title": "", "items": [("GrenadeW", 3), ("GrenadeC", 3), ("StickyBomb", 2), ("Shovel", 2), ("Binoculars", 1)]},
    ],
    "tank": [
        {"title": "", "items": [("SoldierSupplies", 10), ("Cloth", 20)]},
        {"title": "", "items": [("LightTankAmmo", 6), ("ATAmmo", 6), ("MiniTankAmmo", 4), ("WorkWrench", 3)]},
        {"title": "", "items": [("BattleTankAmmo", 4), ("ATLargeAmmo", 3), ("MGAmmo", 3)]},
        {"title": "", "items": [("StickyBomb", 3), ("RpgW", 2), ("ATRPGLightC", 2), ("RpgAmmo", 4), ("SmokeGrenade", 2)]},
    ],
    "artillery": [
        {"title": "", "items": [("SoldierSupplies", 10), ("Cloth", 20)]},
        {"title": "", "items": [("LightArtilleryAmmo", 8), ("HeavyArtilleryAmmo", 6)]},
        {"title": "", "items": [("Mortar", 1), ("MortarAmmo", 6), ("MortarAmmoFL", 3), ("MortarAmmoSH", 3), ("MortarAmmoFlame", 2)]},
        {"title": "", "items": [("Binoculars", 3), ("Radio", 3), ("RadioBackpack", 2), ("Tripod", 2)]},
    ],
    "builder": [
        {"title": "", "items": [("Cloth", 40), ("SoldierSupplies", 10)]},
        {"title": "", "items": [("Shovel", 3), ("SledgeHammer", 2), ("WorkHammer", 2), ("WorkWrench", 2)]},
        {"title": "", "items": [("SandbagMaterials", 4), ("BarbedWireMaterials", 4), ("MetalBeamMaterials", 3)]},
        {"title": "", "items": [("FacilityMaterials1", 4), ("Concrete", 3), ("Wood", 6)]},
        {"title": "", "items": [("WaterBucket", 2), ("GasMask", 2), ("GasMaskFilter", 3)]},
    ],
    "frontline": [
        {"title": "", "items": [("SoldierSupplies", 15), ("Cloth", 20)]},
        {"title": "", "items": [("Bandages", 4), ("FirstAidKit", 3), ("TraumaKit", 3), ("BloodPlasma", 3)]},
        {"title": "", "items": [("RifleAmmo", 6), ("MGAmmo", 4), ("GrenadeW", 4), ("GrenadeC", 4), ("HEGrenade", 3)]},
        {"title": "", "items": [("SandbagMaterials", 3), ("BarbedWireMaterials", 3), ("Shovel", 2)]},
        {"title": "", "items": [("RpgAmmo", 3), ("StickyBomb", 3), ("SmokeGrenade", 2)]},
    ],
}

MAX_TIERS: Final[int] = 12
MAX_ITEMS: Final[int] = 40
MAX_CRATES: Final[int] = 999


def _tiers(tiers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"title": t["title"], "items": [{"code": c, "crates": n} for c, n in t["items"]]} for t in tiers]


def default_pyramid(faction: str = "warden") -> dict[str, Any]:
    return {"faction": faction, "tiers": _tiers(DEFAULT_TIERS)}


def presets() -> list[dict[str, Any]]:
    """Конфигурации для выбора на странице (без фракции: фильтр — по фракции клана)."""
    return [{"key": key, "tiers": _tiers(tiers)} for key, tiers in PRESETS.items()]
