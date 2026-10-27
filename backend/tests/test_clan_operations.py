"""Операции клана: календарь, снимок карты, опрос участников; чужой клан и гость не видят."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.main import app
from tests.conftest import bearer, run, seed_clan

API = "/api/v1/clan/operations"
SNAPSHOT = {
    "rect": {"x": 0, "y": 0, "w": 500, "h": 300},
    "war": 141,
    "phase": "conquest",
    "regions": [],
    "shapes": [
        {"id": "a", "kind": "order", "report": "rep-1", "title": "Склад", "x": 1, "y": 2, "angle": 0, "size": 100},
        {"id": "b", "kind": "order", "report": "rep-1", "title": "Склад", "x": 3, "y": 4, "angle": 0, "size": 100},
        {"id": "c", "kind": "arrow", "x": 0, "y": 0, "angle": 90, "length": 300, "width": 4, "unit": "tanks", "name": "Удар", "color": "#f5a524"},
    ],
}


def auth(user_id: str, clan_id: str, role: ClanRole, name: str | None = None, guest: bool = False) -> dict[str, str]:
    token = issue_access_token(user_id=user_id, clan_id=clan_id, role=role, display_name=name, guest=guest)
    return {"Authorization": f"Bearer {token}"}


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def test_operations_calendar_snapshot_and_poll(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        await seed_clan("CLAN_B")
        boss = auth("boss", "CLAN_A", ClanRole.OWNER, "Boss")
        member = auth("mem", "CLAN_A", ClanRole.MEMBER, "Mem")
        stranger = bearer(user_id="eve", clan_id="CLAN_B", role=ClanRole.OWNER)
        guest = auth("guest-1", "CLAN_A", ClanRole.GUEST, guest=True)
        async with client() as c:
            assert (await c.get(API, headers=member)).json()["operations"] == []

            r = await c.post(API, headers=boss, json={"title": "  Прорыв  ", "date": "2026-11-02", "note": "сбор в 19:00", "snapshot": SNAPSHOT})
            assert r.status_code == 201, r.text
            op = r.json()
            assert op["title"] == "Прорыв" and op["report_ids"] == ["rep-1"] and op["has_snapshot"] and op["can_edit"]
            plain = (await c.post(API, headers=boss, json={"title": "Логистика", "date": "2026-11-05"})).json()
            assert plain["has_snapshot"] is False

            # календарь: фильтр по датам, участник видит, но править чужое не может
            listed = (await c.get(API, headers=member, params={"start": "2026-11-01", "end": "2026-11-03"})).json()
            assert [o["title"] for o in listed["operations"]] == ["Прорыв"] and listed["operations"][0]["can_edit"] is False
            full = (await c.get(f"{API}/{op['id']}", headers=member)).json()
            assert full["snapshot"]["shapes"][2]["name"] == "Удар"
            assert (await c.put(f"{API}/{op['id']}", headers=member, json={"title": "x", "date": "2026-11-02"})).status_code == 403
            assert (await c.delete(f"{API}/{op['id']}", headers=member)).status_code == 403

            # опрос: отметиться и сняться
            r = await c.post(f"{API}/{op['id']}/attend", headers=member, json={"going": True})
            assert [p["name"] for p in r.json()["participants"]] == ["Mem"]
            r = await c.post(f"{API}/{op['id']}/attend", headers=boss, json={"going": True})
            assert {p["user_id"] for p in r.json()["participants"]} == {"mem", "boss"}
            r = await c.post(f"{API}/{op['id']}/attend", headers=member, json={"going": False})
            assert [p["user_id"] for p in r.json()["participants"]] == ["boss"]

            # перенос даты автором
            r = await c.put(f"{API}/{op['id']}", headers=boss, json={"title": "Прорыв 2", "date": "2026-11-03", "note": ""})
            assert r.status_code == 200 and r.json()["date"] == "2026-11-03"

            # изоляция: чужой клан и гость
            assert (await c.get(API, headers=stranger)).json()["operations"] == []
            assert (await c.get(f"{API}/{op['id']}", headers=stranger)).status_code == 404
            assert (await c.get(API, headers=guest)).json() == {"can_create": False, "operations": []}
            assert (await c.post(f"{API}/{op['id']}/attend", headers=guest, json={"going": True})).status_code == 404

            # кривой снимок не принимается
            assert (await c.post(API, headers=boss, json={"title": "X", "date": "2026-11-02", "snapshot": {"rect": 1}})).status_code == 422

            assert (await c.delete(f"{API}/{plain['id']}", headers=boss)).status_code == 204
            assert [o["title"] for o in (await c.get(API, headers=boss)).json()["operations"]] == ["Прорыв 2"]

    run(main())
