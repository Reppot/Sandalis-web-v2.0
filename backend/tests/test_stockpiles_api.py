"""E2E: склады и позиции — CRUD, изоляция кланов, RBAC, локализация."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.permissions import ClanRole
from app.main import app
from tests.conftest import bearer, run, seed_catalog_item, seed_clan

API = "/api/v1"


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")


def test_stockpile_crud_items_tenancy_rbac(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        await seed_clan("CLAN_B", "Bravo")
        await seed_catalog_item()
        admin_a = bearer(clan_id="CLAN_A")
        admin_b = bearer(clan_id="CLAN_B")
        ru = {**admin_a, "Accept-Language": "ru"}

        async with client() as c:
            # --- create -----------------------------------------------------
            r = await c.post(f"{API}/stockpiles",
                             json={"name": "Main", "region": "Deadlands"}, headers=ru)
            assert r.status_code == 201, r.text
            created = r.json()
            assert created["message"] == "Склад «Main» создан."
            sid = created["stockpile"]["id"]
            assert "clan_id" not in created["stockpile"]

            # имя уникально внутри клана -> 409 (ru)
            dup = await c.post(f"{API}/stockpiles",
                               json={"name": "Main", "region": "X"}, headers=ru)
            assert dup.status_code == 409
            assert dup.json()["error"]["message"] == \
                "Склад с именем «Main» уже существует."

            # --- items -------------------------------------------------------
            up = await c.post(f"{API}/stockpiles/{sid}/items",
                              json={"item_code": "rifle", "quantity": 5},
                              headers={**admin_a, "Accept-Language": "cs"})
            assert up.status_code == 201, up.text
            assert up.json()["message"] == "„rifle“: 5 ks."

            patch = await c.patch(f"{API}/stockpiles/{sid}/items/rifle",
                                  json={"quantity": 3}, headers=admin_a)
            assert patch.json()["item"]["quantity"] == 3

            detail = await c.get(f"{API}/stockpiles/{sid}", headers=admin_a)
            d = detail.json()
            assert d["items_count"] == 1 and d["total_quantity"] == 3
            assert d["items"][0]["item_code"] == "rifle"

            listed = await c.get(f"{API}/stockpiles", headers=admin_a)
            assert listed.json()["total"] == 1
            assert listed.json()["items"][0]["total_quantity"] == 3

            # неизвестный предмет каталога -> 404 домена catalog (ru)
            nope = await c.post(f"{API}/stockpiles/{sid}/items",
                                json={"item_code": "nope", "quantity": 1}, headers=ru)
            assert nope.status_code == 404
            assert nope.json()["error"]["message"] == \
                "Предмет с кодом nope не найден в каталоге."

            # удаление позиции и её повторное удаление -> 404 (cs)
            assert (await c.delete(f"{API}/stockpiles/{sid}/items/rifle",
                                   headers=admin_a)).status_code == 204
            gone = await c.delete(f"{API}/stockpiles/{sid}/items/rifle",
                                  headers={**admin_a, "Accept-Language": "cs"})
            assert gone.status_code == 404
            assert gone.json()["error"]["message"] == "Ve skladu není „rifle“."

            # --- изоляция: клан B не видит и не может трогать склад A --------
            assert (await c.get(f"{API}/stockpiles", headers=admin_b)).json()["total"] == 0
            for method in ("get", "patch", "delete"):
                resp = await getattr(c, method)(
                    f"{API}/stockpiles/{sid}",
                    headers={**admin_b, "Accept-Language": "ru"},
                    **({"json": {"name": "hijack"}} if method == "patch" else {}),
                )
                assert resp.status_code == 404, method
                assert resp.json()["error"]["message"] == "Склад не найден в вашем клане."

            # --- RBAC: guest не пишет, member пишет ---------------------------
            g = await c.post(f"{API}/stockpiles",
                             json={"name": "G", "region": "R"},
                             headers=bearer(role=ClanRole.GUEST))
            assert g.status_code == 403
            m = await c.post(f"{API}/stockpiles",
                             json={"name": "Second", "region": "R"},
                             headers=bearer(role=ClanRole.MEMBER))
            assert m.status_code == 201   # у MEMBER есть stockpiles:write

            # --- delete -------------------------------------------------------
            assert (await c.delete(f"{API}/stockpiles/{sid}",
                                   headers=admin_a)).status_code == 204
            assert (await c.get(f"{API}/stockpiles/{sid}",
                                headers=admin_a)).status_code == 404

    run(main())
