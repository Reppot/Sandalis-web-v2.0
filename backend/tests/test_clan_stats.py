"""Статистика клана: заказы, вклады и таймеры участников; чужой клан не виден."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.permissions import ClanRole
from app.main import app
from tests.conftest import bearer, run, seed_clan

API = "/api/v1"


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def test_clan_stats(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        await seed_clan("CLAN_B")
        alice = bearer(user_id="alice", clan_id="CLAN_A", role=ClanRole.OFFICER)
        bob = bearer(user_id="bob", clan_id="CLAN_A", role=ClanRole.MEMBER)
        stranger = bearer(user_id="eve", clan_id="CLAN_B", role=ClanRole.OWNER)
        async with client() as c:
            report = (await c.post(f"{API}/reports", headers=alice, json={"title": "Фронт", "lines": [
                {"name": "Rifle", "item_code": None, "quantity": 10, "unit": "crate"},
                {"name": "7.62mm", "quantity": 5, "unit": "crate"},
            ]})).json()["report"]
            rifle, ammo = (l["id"] for l in report["lines"])
            await c.post(f"{API}/reports/{report['id']}/progress", headers=bob, json={"stockpile_label": "BB", "lines": [{"line_id": rifle, "quantity": 4}, {"line_id": ammo, "quantity": 2}]})
            await c.post(f"{API}/reports/{report['id']}/progress", headers=bob, json={"stockpile_label": "BB", "lines": [{"line_id": rifle, "quantity": 3}]})

            r = await c.get(f"{API}/clan/stats", headers=alice, params={"days": 30})
            assert r.status_code == 200, r.text
            stats = r.json()
            assert stats["period_days"] == 30 and stats["orders_total"] == 1 and stats["orders_by_status"] == {"in_progress": 1}
            assert stats["deliveries"] == 2 and stats["delivered_qty"] == 9
            people = {m["user_id"]: m for m in stats["members"]}
            assert people["bob"]["deliveries"] == 2 and people["bob"]["delivered_qty"] == 9
            assert people["alice"]["orders_created"] == 1 and people["alice"]["deliveries"] == 0
            # лидер по привезённому — первым; топ предметов по количеству
            assert stats["members"][0]["user_id"] == "bob"
            assert [(t["name"], t["quantity"]) for t in stats["top_items"]] == [("Rifle", 7), ("7.62mm", 2)]
            assert len(stats["activity"]) == 30 and stats["activity"][-1]["deliveries"] == 2

            # другой клан не видит чужих заказов; неизвестный период -> 30 дней
            other = (await c.get(f"{API}/clan/stats", headers=stranger, params={"days": 5})).json()
            assert other["period_days"] == 30 and other["orders_total"] == 0 and other["deliveries"] == 0
            assert "bob" not in {m["user_id"] for m in other["members"]}

    run(main())
