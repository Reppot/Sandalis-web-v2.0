"""Рецепты производства всех построек с foxhole.wiki.gg -> app/seed/data/facility_recipes.json.

Источник — Cargo-таблица Production (та же, что рисует «Facility Recipe» на страницах
построек): входы, мощность, время, фракция, побочные продукты и альтернативные
рецепты (модификации построек). В БД попадают как production_recipes с kind="facility";
их читает «Калькулятор завода».

Добыча (шахты, харвестеры, насосы) и электростанции пропускаются: сырьё и
электричество калькулятор считает исходными ресурсами.

    python scripts/wiki_production_fetch.py            # запускает и еженедельный wiki-sync
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://foxhole.wiki.gg/api.php"
UA = "SindarisTerminalBot/1.0 (+https://sandalis-web-v2-0.onrender.com)"
ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "app/seed/data/catalog.json"
OUT = ROOT / "app/seed/data/facility_recipes.json"

FIELDS = [
    "_pageName=page", "Source", "ProductionCategory",
    *[f"InputItem{i}{s}" for i in range(1, 7) for s in ("", "Amount", "Unit")],
    "InputVehicle", "InputPower",
    "Output", "OutputType", "OutputAmount", "OutputUnit",
    "SecondaryOutput", "SecondaryOutputAmount", "SecondaryOutputUnit",
    "TertiaryOutput", "TertiaryOutputAmount", "TertiaryOutputUnit",
    "IsCrateOutput", "CrateCapacity", "ProductionTime", "Faction", "IsMPFable", "RecipeRank",
]
FACTIONS = {"Col": ["colonial"], "War": ["warden"], "Both": ["neutral"]}
# добыча сырья, медицина и запас энергии корабля — не производство предметов
SKIP_SOURCES = {
    "Salvage Mine", "Component Mine", "Sulfur Mine", "Oil Well", "Water Pump",
    "Engine Room", "Field Hospital", "Hospital", "Medical Room", "BMS Bloodtender",
}


def fetch() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for offset in range(0, 5000, 500):
        params = {
            "action": "cargoquery", "format": "json", "tables": "Production",
            "fields": ",".join(FIELDS), "limit": "500", "offset": str(offset),
        }
        req = urllib.request.Request(f"{API}?{urllib.parse.urlencode(params)}", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            page = [x["title"] for x in json.load(r)["cargoquery"]]
        rows += page
        if len(page) < 500:
            return rows
        time.sleep(1)
    return rows


def num(value: str | None) -> float:
    try:
        n = float((value or "").replace(",", ""))
    except ValueError:
        return 0.0
    return int(n) if n.is_integer() else n


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    icons: dict[str, tuple[str, str | None]] = {}
    for c in catalog:
        for name in (c.get("english_name"), c.get("name")):
            if name:
                icons.setdefault(name.lower(), (c["code"], c.get("icon_url")))

    def part(name: str, amount: str | None, unit: str | None) -> dict:
        code, icon = icons.get(name.lower(), (None, None))
        return {"name": name, "amount": num(amount) or 1, "unit": (unit or "").strip() or None,
                "code": code, "icon_url": icon}

    out: list[dict] = []
    seen: dict[str, int] = {}
    for r in fetch():
        inputs = [part(r[f"InputItem{i}"], r[f"InputItem{i}Amount"], r[f"InputItem{i}Unit"])
                  for i in range(1, 7) if (r.get(f"InputItem{i}") or "").strip()]
        output = (r.get("Output") or "").strip()
        # добыча (нет входов) и электростанции — исходные ресурсы, не рецепты
        source = r["Source"].strip()
        if (not output or source in SKIP_SOURCES or source.startswith("Stationary Harvester")
                or (r.get("OutputUnit") or "").strip() == "MW" or (not inputs and not r.get("InputVehicle"))):
            continue
        module = (r.get("ProductionCategory") or "").strip()
        module = None if module in ("", "None") else module
        extras = [part(r[f"{k}Output"], r[f"{k}OutputAmount"], r[f"{k}OutputUnit"])
                  for k in ("Secondary", "Tertiary") if (r.get(f"{k}Output") or "").strip()]
        main_part = part(output, r.get("OutputAmount"), r.get("OutputUnit"))

        base = f"facility-{slug(output)}-{slug(source)}" + (f"-{slug(module)}" if module else "")
        if len(base) > 72:
            base = base[:63] + "-" + hashlib.sha1(base.encode()).hexdigest()[:8]
        seen[base] = seen.get(base, 0) + 1
        rid = base if seen[base] == 1 else f"{base}-{seen[base]}"

        out.append({
            "id": rid,
            "kind": "facility",
            "name": output,
            "name_en": output,
            "item_code": main_part["code"],
            "category": slug(source)[:32],
            "item_class": module,
            "description": None,
            "factions": FACTIONS.get((r.get("Faction") or "").strip(), ["neutral"]),
            "facilities": [slug(source)[:32]],
            "icon_url": main_part["icon_url"],
            "output_quantity": int(main_part["amount"]) or 1,
            "cost": {p["name"]: p["amount"] for p in inputs},
            "data": {
                "source": source,
                "module": module,
                "inputs": inputs,
                "vehicle": (r.get("InputVehicle") or "").strip() or None,
                "power_mw": num(r.get("InputPower")),
                "seconds": num(r.get("ProductionTime")),
                "output_unit": main_part["unit"],
                "byproducts": extras,
                "crate": (r.get("IsCrateOutput") or "") in ("1", "Yes", "yes", "true"),
                "page": r.get("page"),
            },
            "sort": len(out),
        })

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    sources = sorted({x["data"]["source"] for x in out})
    print(f"facility recipes: {len(out)}, outputs: {len({x['name'] for x in out})}, sources: {len(sources)}", file=sys.stderr)


if __name__ == "__main__":
    main()
