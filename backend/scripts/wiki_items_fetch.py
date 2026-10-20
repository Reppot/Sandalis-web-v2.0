"""Снимок предметов Foxhole с foxhole.wiki.gg (Cargo API) -> scripts/wiki_items_snapshot.json.

Таблицы: itemdata (предметы), vehicles, structures, icondata (иконки всего подряд).
Ключ — игровой codename: тот же код, по которому устроен наш каталог.

    python scripts/wiki_items_fetch.py [scripts/wiki_items_snapshot.json]
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://foxhole.wiki.gg/api.php"
UA = "SindarisTerminalBot/1.0 (+https://sandalis-web-v2-0.onrender.com)"
TABLES = {
    "itemdata": "codename,name,image,imageOverride,faction,ItemCategory,aliases,version",
    "vehicles": "codename,name,image,imageOverride,faction,type,aliases,version",
    "structures": "codename,name,image,imageOverride,faction,type,aliases,version",
    "icondata": "codename,name,image,imageOverride,origin,aliases,version",
}
PAGE = 500


def get(params: dict) -> dict:
    url = f"{API}?{urllib.parse.urlencode({**params, 'format': 'json'})}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except OSError:
            time.sleep(2 * (attempt + 1))
    raise SystemExit(f"wiki unavailable: {url}")


def fetch_table(table: str, fields: str) -> list[dict]:
    rows: list[dict] = []
    while True:
        data = get({"action": "cargoquery", "tables": table, "fields": f"_pageName={'page'},{fields}",
                    "limit": PAGE, "offset": len(rows)})
        if "error" in data:
            raise SystemExit(f"{table}: {data['error']}")
        chunk = [r["title"] for r in data.get("cargoquery", [])]
        rows += chunk
        if len(chunk) < PAGE:
            return rows


def image_urls(files: set[str]) -> dict[str, str]:
    """File:X.png -> прямой URL картинки (imageinfo, пачками по 50)."""
    out: dict[str, str] = {}
    names = sorted(files)
    for i in range(0, len(names), 50):
        batch = names[i:i + 50]
        data = get({"action": "query", "prop": "imageinfo", "iiprop": "url",
                    "titles": "|".join(f"File:{n}" for n in batch)})
        pages = data.get("query", {}).get("pages", {})
        normalized = {n["to"]: n["from"] for n in data.get("query", {}).get("normalized", [])}
        for page in pages.values():
            info = page.get("imageinfo")
            if info:
                title = normalized.get(page["title"], page["title"])
                out[title.removeprefix("File:")] = info[0]["url"]
    return out


def main() -> None:
    dst = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).with_name("wiki_items_snapshot.json"))
    tables = {t: fetch_table(t, f) for t, f in TABLES.items()}
    files = {(r.get("imageOverride") or r.get("image") or "").strip() for rows in tables.values() for r in rows}
    files.discard("")
    urls = image_urls(files)
    # без даты выгрузки: снимок меняется в git только при реальных изменениях на вики
    snapshot = {"source": "https://foxhole.wiki.gg", "tables": tables, "images": urls}
    dst.write_text(json.dumps(snapshot, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print({t: len(r) for t, r in tables.items()}, "images:", len(urls), "->", dst)


if __name__ == "__main__":
    main()
