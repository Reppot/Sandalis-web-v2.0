"""E2E: RBAC-матрица invite-кодов, выпуск клановых токенов, legacy GET /codes."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.permissions import ClanRole
from app.main import app
from tests.conftest import bearer, run, seed_catalog_item, seed_clan

API = "/api/v1"


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")


def test_clan_api_token_issuance(db):
    async def main() -> None:
        await seed_clan()
        async with client() as c:
            ct = await c.post(f"{API}/auth/clan-token",
                              json={"label": "bot", "role": "guest"}, headers=bearer())
            assert ct.status_code == 201, ct.text
            raw = ct.json()["raw_token"]
            assert raw.startswith("sdt_")
            assert ct.json()["message"] == \
                'Token "bot" created. Store it now — it is shown only once.'

            ok = await c.get(f"{API}/orders", headers={"X-Clan-Token": raw})
            assert ok.status_code == 200

            # member без clan:settings:write -> 403
            no = await c.post(f"{API}/auth/clan-token",
                              json={"label": "x", "role": "guest"},
                              headers=bearer(role=ClanRole.MEMBER))
            assert no.status_code == 403

            # роль выше собственной (admin -> owner) запрещена
            high = await c.post(f"{API}/auth/clan-token",
                                json={"label": "boss", "role": "owner"},
                                headers=bearer())
            assert high.status_code == 403
            assert high.json()["error"]["message"] == \
                "Cannot issue a token with a role above your own: owner."

    run(main())


def test_legacy_codes_endpoint(db):
    async def main() -> None:
        await seed_catalog_item("rifle", "small_arms", "Винтовка", "Rifle")
        await seed_catalog_item("bandage", "medical", "Бинт", "Bandage")
        await seed_clan()
        guest = bearer(role=ClanRole.GUEST)

        async with client() as c:
            r = await c.get(f"{API}/codes", headers=guest)
            assert r.status_code == 200
            body = r.json()
            assert isinstance(body, list) and len(body) == 2
            assert {
                "id", "code", "name", "english_name", "category",
                "icon_url", "crate_size", "production_time", "is_active",
            } <= set(body[0])
            assert "clan_id" not in body[0]

            # точное совпадение кода — первым (как в старом backend)
            ex = await c.get(f"{API}/codes", params={"query": "bandage"}, headers=guest)
            assert ex.json()[0]["code"] == "bandage"

            med = await c.get(f"{API}/codes", params={"category": "medical"}, headers=guest)
            assert [i["code"] for i in med.json()] == ["bandage"]

            # без токена -> 401 (осознанное ужесточение против публичного v1)
            assert (await c.get(f"{API}/codes")).status_code == 401

    run(main())
