"""Демо-клан для проверки интерфейса под нагрузкой — ТОЛЬКО локальный бэкенд.

Создаёт через обычное API (dev-token) клан с участниками, ~28 складами с содержимым,
таймерами во всех состояниях, заказами с прогрессом и записями в журналах.
Скрипт отказывается работать с любым адресом, кроме localhost / 127.0.0.1:
данные вымышленные и не должны попасть на прод.

    .venv/Scripts/python.exe scripts/seed_demo_clan.py --base http://127.0.0.1:8020
"""
from __future__ import annotations

import argparse
import random
import sys
from urllib.parse import urlparse

import httpx

CLAN_ID = "REPPOT-TEST"
OWNER = ("demo-owner", "Reppot")
MEMBERS = [
    ("demo-01", "Kharkov", "admin"), ("demo-02", "Volk_77", "officer"), ("demo-03", "Ironside", "officer"),
    ("demo-04", "Sasha Logi", "member"), ("demo-05", "Bunker_Boy", "member"), ("demo-06", "Mira", "member"),
    ("demo-07", "Gromov", "member"), ("demo-08", "Tankist", "member"), ("demo-09", "Pepper", "member"),
    ("demo-10", "Ded Mazay", "member"), ("demo-11", "Shtorm", "member"), ("demo-12", "Zhenya", "member"),
]
PLACES = [
    ("Deadlands", "Callahan's Gate"), ("Deadlands", "Iron's End"), ("Callahan's Passage", "Lochan"),
    ("Callahan's Passage", "Scattered Ruins"), ("The Moors", "Ogmara"), ("The Moors", "Gravekeeper's Holdfast"),
    ("Umbral Wildwood", "Hermit's Rest"), ("Umbral Wildwood", "Atropos' Fate"), ("Westgate", "Westgate Keep"),
    ("Westgate", "Kingstone"), ("Basin Sionnach", "Cuttail Station"), ("Speaking Woods", "Sotto Bank"),
    ("Heartlands", "The Blemish"), ("Heartlands", "Proexi"), ("Great March", "Lionsfort"),
    ("Great March", "Dendré Field"), ("Loch Mór", "Mercy's Wish"), ("Linn of Mercy", "Ulster Falls"),
    ("Reaching Trail", "Brodytown"), ("Reaching Trail", "Dwyerstown"), ("Stonecradle", "The Long Fast"),
    ("Farranac Coast", "Victa"), ("Fisherman's Row", "Arcadia"), ("Endless Shore", "Brackish Point"),
    ("The Fingers", "Captain's Dread"), ("Morgen's Crossing", "Allsight"), ("Godcrofts", "Isle of Psyche"),
    ("Tempest Island", "Alchimio Estate"),
]
KINDS = ["seaport", "depot", "depot", "other"]
NOTES = [
    "Срочно на фронт к вечерней атаке", "Пополнение после ночного пуша", "Для бункерной базы на мосту",
    "Нужно до конца смены — артиллерия простаивает", None, None,
]
LOG = [
    "Обновил таймер, всё ок", "Забрал 5 ящиков bmat на фронт", "Пароль сменили, спрашивайте в канале",
    "Склад почти пустой, нужны rmat", "Колонисты рядом — будьте осторожны", "Привёз 20 ящиков патронов",
]


def guard(base: str) -> None:
    host = urlparse(base).hostname
    if host not in {"localhost", "127.0.0.1", "::1"}:
        sys.exit(f"Отказ: {base} — не локальный адрес. Демо-данные пишутся только в локальную базу.")


def client(base: str, user_id: str, name: str, role: str) -> httpx.Client:
    c = httpx.Client(base_url=base, timeout=30)
    r = c.post("/api/v1/auth/dev-token", json={"user_id": user_id, "clan_id": CLAN_ID, "role": role, "display_name": name})
    r.raise_for_status()
    c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return c


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8020")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    guard(args.base)
    rnd = random.Random(args.seed)

    owner = client(args.base, *OWNER, "owner")
    users = [owner] + [client(args.base, uid, name, role) for uid, name, role in MEMBERS]
    # таймеры и статусы заказов меняют командиры и офицеры; остальное — все участники
    chiefs = [owner] + [u for u, (_, _, role) in zip(users[1:], MEMBERS) if role in {"admin", "officer"}]

    items = owner.get("/api/v1/items", params={"limit": 500}).json()["items"]
    crateable = [i for i in items if i.get("is_active", True) and i.get("origin", "item") == "item" and i.get("category") not in {"vehicles", "structures"}]
    print(f"каталог: {len(items)} предметов")

    # склады: уже созданные (повторный запуск) переиспользуем
    existing = {s["name"]: s for s in owner.get("/api/v1/stockpiles", params={"limit": 200}).json()["items"]}
    stockpiles = []
    for idx, (region, town) in enumerate(PLACES):
        name = f"{town} {['Депо', 'Порт', 'Хаб', 'Резерв'][idx % 4]}"
        if name in existing:
            stockpiles.append(existing[name])
            continue
        kind = KINDS[idx % len(KINDS)]
        r = owner.post("/api/v1/stockpiles", json={"name": name, "region": region, "town": town, "kind": kind, "access_code": f"{rnd.randint(100000, 999999)}" if idx % 5 else None})
        r.raise_for_status()
        s = r.json()["stockpile"]
        stockpiles.append(s)
        # содержимое: от пустого до 120 позиций
        size = [0, 8, 25, 60, 120][idx % 5]
        if size:
            pick = rnd.sample(crateable, min(size, len(crateable)))
            payload = [{"item_code": i["code"], "quantity": rnd.choice([1, 2, 3, 5, 8, 12, 20, 35, 60, 150]), "unit": "crate"} for i in pick]
            owner.put(f"/api/v1/stockpiles/{s['id']}/items", json={"items": payload, "source": rnd.choice(["json", "txt", "scan"])}).raise_for_status()
    print(f"склады: {len(stockpiles)}")

    # таймеры: истёкшие, критичные (<1 ч), внимание (<24 ч), спокойные
    timers = owner.get("/api/v1/timers", params={"limit": 200}).json()
    timers = timers["items"] if isinstance(timers, dict) else timers
    with_timer = {t.get("stockpile_id") for t in timers}
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    for idx, s in enumerate(stockpiles[:22]):
        if s["id"] in with_timer:
            continue
        left = [45, 900, 2400, 3 * 3600, 9 * 3600, 20 * 3600, 30 * 3600, 44 * 3600][idx % 8]
        author = rnd.choice(chiefs)
        r = author.post("/api/v1/timers", json={
            "title": s["name"], "kind": "stockpile_decay", "ends_at": (now + timedelta(seconds=left)).isoformat(),
            "duration_seconds": 48 * 3600, "stockpile_id": s["id"], "note": rnd.choice(NOTES),
        })
        r.raise_for_status()
        tid = r.json()["timer"]["id"]
        for _ in range(rnd.randint(0, 4)):
            rnd.choice(users).post(f"/api/v1/timers/{tid}/events", json={"message": rnd.choice(LOG)})
    print("таймеры: готово")

    # заказы клана: разные статусы, размеры и прогресс выполнения
    have = owner.get("/api/v1/reports", params={"limit": 200}).json()["items"]
    if len(have) < 10:
        titles = ["Снабжение фронта Deadlands", "Бункер на мосту", "Артиллерия 120мм", "Медицина для штаба", "Фабрика: патроны 7.62",
                  "Стройка: бетон и сталь", "Танковая группа", "Оборона Westgate", "Колонна в Basin", "Резерв на выходные",
                  "Миномётная батарея", "Партизанский склад"]
        statuses = ["open", "open", "in_progress", "in_progress", "open", "done", "in_progress", "cancelled", "open", "done", "open", "in_progress"]
        for n, (title, status) in enumerate(zip(titles, statuses)):
            author = rnd.choice(chiefs)
            lines = [{"name": i["name"], "item_code": i["code"], "quantity": rnd.choice([2, 3, 5, 10, 15, 25, 40]), "unit": rnd.choice(["crate", "crate", "unit"])}
                     for i in rnd.sample(crateable, [3, 6, 12, 24, 40][n % 5])]
            target = stockpiles[n % len(stockpiles)]
            r = author.post("/api/v1/reports", json={
                "title": title, "note": rnd.choice(NOTES), "lines": lines,
                "meta": {"region": target["region"], "stockpile": target["name"], "type": rnd.choice(["stockpile", "bunker", "factory"])},
            })
            r.raise_for_status()
            rep = r.json()["report"]
            if status in {"in_progress", "done"}:
                owner.post(f"/api/v1/reports/{rep['id']}/status", json={"status": "in_progress"})
                for _ in range(rnd.randint(1, 4)):
                    chunk = [{"line_id": l["id"], "quantity": max(1, l["quantity"] // rnd.randint(2, 4))} for l in rnd.sample(rep["lines"], max(1, len(rep["lines"]) // 2))]
                    rnd.choice(users).post(f"/api/v1/reports/{rep['id']}/progress", json={"lines": chunk, "stockpile_id": target["id"], "note": rnd.choice([None, "Довёз остаток", "Часть на соседний склад"])})
            if status in {"done", "cancelled"}:
                owner.post(f"/api/v1/reports/{rep['id']}/status", json={"status": status})
    print("заказы: готово")
    print(f"Клан {CLAN_ID}: вход — dev-token user_id={OWNER[0]} clan_id={CLAN_ID} role=owner")


if __name__ == "__main__":
    main()
