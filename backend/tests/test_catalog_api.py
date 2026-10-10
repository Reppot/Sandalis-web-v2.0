"""E2E: глобальный каталог — виден всем кланам одинаково, поиск, 404-локали."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.permissions import ClanRole
from app.main import app
from tests.conftest import bearer, run, seed_catalog_item, seed_clan

API = "/api/v1"


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")


def test_catalog_is_global_and_searchable(db):
    async def main() -> None:
        await seed_catalog_item("rifle", "small_arms", "Винтовка", "Rifle")
        await seed_catalog_item("bandage", "medical", "Бинт", "Bandage")
        await seed_catalog_item("legacy_part", "resources", "Старая деталь", "Old part",
                                is_active=False)
        await seed_clan("CLAN_A")
        await seed_clan("CLAN_B", "Bravo")
        guest_a = bearer(clan_id="CLAN_A", role=ClanRole.GUEST)
        guest_b = bearer(clan_id="CLAN_B", role=ClanRole.GUEST)

        async with client() as c:
            la = await c.get(f"{API}/items", headers=guest_a)
            lb = await c.get(f"{API}/items", headers=guest_b)
            # каталог один на всех: клан не влияет на выдачу
            assert la.json()["total"] == lb.json()["total"] == 3
            assert "clan_id" not in la.json()["items"][0]

            # гость клана имеет catalog:read -> доступ есть
            assert la.status_code == 200

            active = await c.get(f"{API}/items",
                                 params={"active_only": True}, headers=guest_a)
            assert active.json()["total"] == 2

            med = await c.get(f"{API}/items",
                              params={"category": "medical"}, headers=guest_a)
            assert [i["code"] for i in med.json()["items"]] == ["bandage"]

            # поиск по подстроке кода и по RU/EN наименованию (как в старом search.py)
            by_code = await c.get(f"{API}/items", params={"query": "rif"}, headers=guest_a)
            assert {i["code"] for i in by_code.json()["items"]} == {"rifle"}
            by_ru = await c.get(f"{API}/items", params={"query": "винт"}, headers=guest_a)
            assert {i["code"] for i in by_ru.json()["items"]} == {"rifle"}
            by_en = await c.get(f"{API}/items", params={"query": "band"}, headers=guest_a)
            assert {i["code"] for i in by_en.json()["items"]} == {"bandage"}

            one = await c.get(f"{API}/items/rifle", headers=guest_a)
            assert one.status_code == 200
            assert one.json()["name"] == "Винтовка"

            miss = await c.get(f"{API}/items/nope",
                               headers={**guest_a, "Accept-Language": "cs"})
            assert miss.status_code == 404
            assert miss.json()["error"]["message"] == \
                "Položka s kódem nope nebyla v katalogu nalezena."

    run(main())
