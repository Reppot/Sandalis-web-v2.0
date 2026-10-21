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

MAX_TIERS: Final[int] = 12
MAX_ITEMS: Final[int] = 40
MAX_CRATES: Final[int] = 999


def default_pyramid(faction: str = "warden") -> dict[str, Any]:
    return {
        "faction": faction,
        "tiers": [{"title": t["title"], "items": [{"code": c, "crates": n} for c, n in t["items"]]} for t in DEFAULT_TIERS],
    }
