"""Журнал выполнения заказа: вклады участников, прогресс по строкам, права на удаление."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.permissions import ClanRole
from app.main import app
from tests.conftest import bearer, run, seed_clan

API = "/api/v1"


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def test_report_progress_log(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        alice = bearer(user_id="alice", clan_id="CLAN_A", role=ClanRole.MEMBER)
        bob = bearer(user_id="bob", clan_id="CLAN_A", role=ClanRole.MEMBER)
        officer = bearer(user_id="boss", clan_id="CLAN_A", role=ClanRole.OFFICER)
        async with client() as c:
            created = await c.post(f"{API}/reports", headers=alice, json={"title": "Фронт", "lines": [
                {"name": "Rifle", "quantity": 10, "unit": "crate"}, {"name": "7.62mm", "quantity": 5, "unit": "crate"},
            ]})
            assert created.status_code == 201, created.text
            report = created.json()["report"]
            rifle, ammo = (l["id"] for l in report["lines"])
            sp = (await c.post(f"{API}/stockpiles", headers=alice, json={"name": "Port Kirknell", "region": "The Moors"})).json()["stockpile"]

            r = await c.post(f"{API}/reports/{report['id']}/progress", headers=bob, json={
                "stockpile_id": sp["id"], "note": "первая партия", "lines": [{"line_id": rifle, "quantity": 4}, {"line_id": ammo, "quantity": 5}],
            })
            assert r.status_code == 201, r.text
            body = r.json()
            assert body["delivered_total"] == 9 and body["ordered_total"] == 15
            [entry] = body["contributions"]
            assert entry["user_id"] == "bob" and entry["stockpile_label"] == "The Moors ▶ Port Kirknell"
            assert {l["name"]: l["quantity"] for l in entry["lines"]} == {"Rifle": 4, "7.62mm": 5}
            assert (await c.get(f"{API}/reports/{report['id']}", headers=alice)).json()["status"] == "in_progress"

            await c.post(f"{API}/reports/{report['id']}/progress", headers=alice, json={"stockpile_label": "BB Callahan", "lines": [{"line_id": rifle, "quantity": 6}]})
            progress = (await c.get(f"{API}/reports/{report['id']}/progress", headers=alice)).json()
            assert [(l["name"], l["delivered"]) for l in progress["lines"]] == [("Rifle", 10), ("7.62mm", 5)]
            newest, oldest = progress["contributions"]
            assert newest["stockpile_label"] == "BB Callahan" and oldest["user_id"] == "bob"

            # чужую запись участник не удалит, офицер (reports:delete) — да; свою — может
            assert (await c.delete(f"{API}/reports/{report['id']}/progress/{oldest['id']}", headers=alice)).status_code == 403
            assert (await c.delete(f"{API}/reports/{report['id']}/progress/{newest['id']}", headers=alice)).status_code == 200
            left = (await c.delete(f"{API}/reports/{report['id']}/progress/{oldest['id']}", headers=officer)).json()
            assert left["delivered_total"] == 0 and left["contributions"] == []

            bad = await c.post(f"{API}/reports/{report['id']}/progress", headers=bob, json={"lines": [{"line_id": "00000000-0000-0000-0000-000000000001", "quantity": 1}]})
            assert bad.status_code == 409
            await c.post(f"{API}/reports/{report['id']}/status", headers=officer, json={"status": "cancelled"})
            closed = await c.post(f"{API}/reports/{report['id']}/progress", headers=bob, json={"lines": [{"line_id": rifle, "quantity": 1}]})
            assert closed.status_code == 409

    run(main())
