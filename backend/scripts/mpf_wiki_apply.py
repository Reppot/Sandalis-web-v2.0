"""Apply foxhole.wiki.gg MPF data (v1.67) to backend/app/seed/data/recipes.json.

Обновление после патча игры:
  curl -A "SindarisTerminalBot/1.0" -o mpf.json "https://foxhole.wiki.gg/api.php?action=parse&page=Mass_Production_Factory&prop=text&format=json&formatversion=2"
  python scripts/mpf_wiki_parse.py mpf.json scripts/mpf_wiki_snapshot.json
  python scripts/mpf_wiki_apply.py scripts/mpf_wiki_snapshot.json app/seed/data/recipes.json app/seed/data/catalog.json

Each MPF recipe gets data.mpf = {seconds, amount, cost, max_crates}; costs are the
per-crate base the wiki totals are built from (verified: every 3..9-crate total
equals sum(floor(base * (10 - min(i, 5)) / 10))).
"""
import json
import re
import sys

wiki = json.load(open(sys.argv[1], encoding="utf-8"))
rec_path, cat_path = sys.argv[2], sys.argv[3]
recipes = json.load(open(rec_path, encoding="utf-8"))
catalog = {c["english_name"]: c for c in json.load(open(cat_path, encoding="utf-8"))}
RES = {"Basic Materials": "bmat", "Refined Materials": "rmat", "Explosive Powder": "emat",
       "Heavy Explosive Powder": "hemat"}

RENAME = {
    "135 Neville Anti-Tank Rifle": "Neville Anti-Tank Rifle",
    "Mortar Flare Shell": "Flare Mortar Shell",
    "Mortar Shrapnel Shell": "Shrapnel Mortar Shell",
    "R.P.G Shell": "RPG",
    "Shatter Missle": "Shatter Missile",
    "E6881-B Hullbreaker Mine": "E681-B Hullbreaker Mine",
    "Leary Snare Trap 127": "Leary Snare Trap 20",
    "BMS - Universal Assemly Rig": "BMS - Universal Assembly Rig",
    "9mm SMG": "9mm",
}
NOT_MPF = {"KRR3-792 Auger", "Clancy-Raca M4"}       # нет в списке производства MPF


def norm(s):
    s = (s or "").lower().replace("“", '"').replace("”", '"').replace("⧸", "/").replace("’", "'")
    if s.startswith(".44"):
        s = ".44"
    return re.sub(r"[^a-z0-9]+", "", s)


def total(base, n):
    return sum(base * (10 - min(i, 5)) // 10 for i in range(1, n + 1))


def base_cost(w):
    out = {}
    for idx, res in enumerate(w["resources"]):
        vals = {int(n): v[idx] for n, v in w["totals"].items()}
        base = next(b for b in range(1, 10000) if all(total(b, n) == v for n, v in vals.items()))
        out[RES[res]] = base
    return out


def mpf_block(w):
    return {
        "seconds": w["seconds"],
        "amount": w["amount"],
        "cost": base_cost(w),
        "max_crates": max(int(n) for n in w["totals"]),
    }


by = {norm(k): (k, v) for k, v in wiki.items()}
used = set()
for r in recipes:
    if r["kind"] != "factory":
        continue
    old = r.get("name_en")
    if old in RENAME:
        if r.get("name") == old:
            r["name"] = RENAME[old]
        r["name_en"] = RENAME[old]
    if r["name_en"] in NOT_MPF:
        r["facilities"] = [f for f in r["facilities"] if f != "mpf"]
        r["data"]["is_mpf_craftable"] = False
        r["data"].pop("mpf", None)
        continue
    key = norm(r["name_en"])
    if key in by and "mpf" in r["facilities"]:
        used.add(key)
        block = mpf_block(by[key][1])
        r["data"]["mpf"] = block
        # в игре база MPF = цена Factory: калькулятор Factory берёт те же значения
        if r["cost"] != block["cost"] or r["output_quantity"] != block["amount"]:
            print("factory synced:", r["name_en"], r["cost"], "->", block["cost"],
                  r["output_quantity"], "->", block["amount"])
        r["cost"] = dict(block["cost"])
        r["output_quantity"] = block["amount"]
    elif "mpf" in r["facilities"]:
        print("MPF recipe without wiki data:", r["name_en"])

CATEGORY = {"950-70b Anti-Aircraft Shell": "heavy_ammunition", "Absol Anti-Aircraft Rounds": "heavy_ammunition",
            "Naval Buoy": "heavy_ammunition"}
FACTIONS = {"warden": ["neutral", "warden"], "colonial": ["neutral", "colonial"]}
sort = max(r.get("sort", 0) for r in recipes) + 1
for key, (wname, w) in by.items():
    if key in used:
        continue
    c = catalog.get(wname)
    if c is None:
        print("no catalog entry, skipped:", wname)
        continue
    category = CATEGORY.get(wname, "vehicles")
    name = c["name"] if c["name"] != c["name"].lower() else c["name"].capitalize()
    slug = re.sub(r"[^a-z0-9]+", "-", wname.lower()).strip("-")
    block = mpf_block(w)
    recipes.append({
        "id": f"factory-{slug}",
        "kind": "factory",
        "name": name,
        "name_en": wname,
        "item_code": c["code"],
        "category": category,
        "item_class": None,
        "description": None,
        "factions": FACTIONS.get(c.get("faction"), ["neutral", "colonial", "warden"]),
        "facilities": ["mpf"] if category == "vehicles" else ["factory", "mpf"],
        "icon_url": c.get("icon_url"),
        "output_quantity": w["amount"],
        "cost": block["cost"],
        "data": {"number_produced_bonus": None, "is_teched": False, "is_mpf_craftable": True, "mpf": block},
        "sort": sort,
    })
    sort += 1
    print("added:", wname, category, block)

open(rec_path, "w", encoding="utf-8", newline="\n").write(json.dumps(recipes, ensure_ascii=False, indent=1) + "\n")
mpf = [r for r in recipes if "mpf" in r["facilities"]]
print("mpf recipes:", len(mpf), "with wiki data:", sum(1 for r in mpf if "mpf" in r["data"]))
diff = [(r["name_en"], r["cost"], r["data"]["mpf"]["cost"], r["output_quantity"], r["data"]["mpf"]["amount"])
        for r in mpf if "mpf" in r["data"] and (r["cost"] != r["data"]["mpf"]["cost"] or r["output_quantity"] != r["data"]["mpf"]["amount"])]
print("factory vs mpf differences:", diff)
