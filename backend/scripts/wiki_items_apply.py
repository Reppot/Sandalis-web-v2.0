"""Каталог предметов по foxhole.wiki.gg: английские названия, игровые иконки, новые позиции.

    python scripts/wiki_items_fetch.py      # снимок вики -> scripts/wiki_items_snapshot.json
    python scripts/wiki_items_apply.py      # снимок -> seed/data/catalog.json, recipes.json, static/items

Правила:
* ключ — игровой codename (= catalog_items.code);
* name и english_name = название с вики (интерфейс показывает английские названия);
  прежнее русское название уходит в aliases — поиск и распознавание отчётов его понимают;
* иконка = файл с вики, static/items/<code>.png (скачивается, только если изменилась);
* новые предметы (с категорией на вики, не «Lore») и техника, которая хранится на складах
  (без поездов, кораблей класса Large и реликтовой техники), добавляются;
* коды, которых нет на вики, остаются как есть с needs_review=true.
Рецепты получают те же английские названия и иконки по item_code.
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT = ROOT / "scripts/wiki_items_snapshot.json"
CATALOG = ROOT / "app/seed/data/catalog.json"
RECIPES = ROOT / "app/seed/data/recipes.json"
ICONS = ROOT / "static/items"
ICON_SOURCES = ROOT / "scripts/wiki_icon_sources.json"   # code -> URL скачанной иконки
UA = "SindarisTerminalBot/1.0 (+https://sandalis-web-v2-0.onrender.com)"

FACTION = {"Both": "neutral", "War": "warden", "Col": "colonial"}
ITEM_CATEGORY = {
    "SmallArms": "weapons", "HeavyArms": "weapons", "HeavyAmmo": "ammo", "Utility": "equipment",
    "Medical": "medical", "Uniforms": "uniforms", "Supplies": "materials", "Parts": "other",
}
SKIP_VEHICLE = re.compile(r"^(LargeShip|Train|SmallTrain|Relic)")
CYRILLIC = re.compile(r"[Ѐ-ӿ]")
# Коды каталога, которых нет на вики: английское название вручную (needs_review остаётся).
MANUAL = {
    "ScoutVehicleW": "Drummond 100a",
    "RareMaterials": "Rare Materials (legacy)",
    "FacilityOil3": "Facility Oil III (legacy)",
    "Unknown": "Unknown",
}


def dump(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")


def download(url: str, dst: Path) -> bool:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read()
    except OSError as exc:
        print("  icon failed:", url, exc)
        return False
    if not (body.startswith(b"\x89PNG") or body.startswith(b"\xff\xd8")):
        print("  not an image:", url)
        return False
    dst.write_bytes(body)
    return True


def main() -> None:
    snap = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    tables, images = snap["tables"], snap["images"]
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    recipes = json.loads(RECIPES.read_text(encoding="utf-8"))
    sources = json.loads(ICON_SOURCES.read_text(encoding="utf-8")) if ICON_SOURCES.exists() else {}

    # codename -> запись вики (приоритет: itemdata > vehicles > structures > icondata)
    wiki: dict[str, tuple[str, dict]] = {}
    for table in ("icondata", "structures", "vehicles", "itemdata"):
        for row in tables[table]:
            for code in (row.get("codename") or "").split(","):
                if code.strip():
                    wiki[code.strip()] = (table, row)

    def image_url(row: dict) -> str | None:
        name = (row.get("imageOverride") or row.get("image") or "").strip()
        return images.get(name)

    by_code = {c["code"]: c for c in catalog}
    stats = {"renamed": 0, "icons": 0, "added": 0, "review": 0}

    # новые позиции
    for row in tables["itemdata"]:
        code = (row.get("codename") or "").strip()
        if code and code not in by_code and row.get("faction") in FACTION and row.get("ItemCategory") in ITEM_CATEGORY:
            by_code[code] = {"code": code, "name": row["name"], "english_name": row["name"],
                             "category": ITEM_CATEGORY[row["ItemCategory"]], "faction": FACTION[row["faction"]],
                             "origin": "item", "icon_url": None, "crate_size": 1, "aliases": [], "needs_review": False}
            catalog.append(by_code[code])
            stats["added"] += 1
    for row in tables["vehicles"]:
        code = (row.get("codename") or "").strip()
        if code and code not in by_code and not SKIP_VEHICLE.match(code):
            by_code[code] = {"code": code, "name": row["name"], "english_name": row["name"], "category": "vehicles",
                             "faction": FACTION.get(row.get("faction"), "neutral"), "origin": "vehicle",
                             "icon_url": None, "crate_size": 1, "aliases": [], "needs_review": False}
            catalog.append(by_code[code])
            stats["added"] += 1

    ICONS.mkdir(parents=True, exist_ok=True)
    for item in catalog:
        hit = wiki.get(item["code"])
        if hit is None:
            manual = MANUAL.get(item["code"])
            if manual:
                old = item.get("name") or ""
                if CYRILLIC.search(old) and old not in item["aliases"]:
                    item["aliases"] = [*item["aliases"], old]
                item["name"] = item["english_name"] = manual
            if not item.get("needs_review"):
                item["needs_review"] = True
                stats["review"] += 1
            continue
        _, row = hit
        item["needs_review"] = False      # подтверждено вики
        name = row["name"].strip()
        old = item.get("name") or ""
        if old and old != name and CYRILLIC.search(old) and old not in item["aliases"]:
            item["aliases"] = [*item["aliases"], old]
        if item.get("english_name") != name or item.get("name") != name:
            stats["renamed"] += 1
        item["name"] = item["english_name"] = name

        url = image_url(row)
        if url:
            ext = ".jpg" if url.split("?")[0].lower().endswith((".jpg", ".jpeg")) else ".png"
            dst = ICONS / f"{item['code']}{ext}"
            if sources.get(item["code"]) != url or not dst.exists():
                if download(url, dst):
                    sources[item["code"]] = url
                    stats["icons"] += 1
            if dst.exists():
                # старые .webp не удаляем: на них ссылается контент, уже сохранённый в БД
                item["icon_url"] = f"/api/v1/assets/items/{dst.name}"

    # рецепты: английское название и иконка предмета
    names = {c["code"]: c for c in catalog}
    by_name = {(c["english_name"] or "").lower(): c for c in catalog}
    for r in recipes:
        if r["kind"] != "factory":
            r["name"] = r.get("name_en") or r["name"]
            continue
        item = names.get(r.get("item_code") or "") or by_name.get((r.get("name_en") or "").lower())
        if item:
            r["name"] = r["name_en"] = item["english_name"]
            r["icon_url"] = item["icon_url"] or r.get("icon_url")
        else:
            r["name"] = r.get("name_en") or r["name"]

    dump(CATALOG, sorted(catalog, key=lambda c: c["code"].lower()))
    dump(RECIPES, recipes)
    dump(ICON_SOURCES, dict(sorted(sources.items())))
    print(stats, "catalog:", len(catalog))


if __name__ == "__main__":
    sys.exit(main())
