"""E2E: RBAC-матрица invite-кодов, выпуск клановых токенов, legacy GET /codes."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.permissions import ClanRole
from app.main import app
from tests.conftest import bearer, run, seed_catalog_item, seed_clan

API = "/api/v1"


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")


def test_invite_rbac_matrix(db):
    async def main() -> None:
        await seed_clan()
        member = bearer(role=ClanRole.MEMBER)
        guest = bearer(role=ClanRole.GUEST)
        officer = bearer(role=ClanRole.OFFICER)
        admin = bearer()

        async with client() as c:
            # создание кодов — только admin (clan:members:write)
            for h in (member, guest, officer):
                r = await c.post(f"{API}/auth/invites", json={},
                                 headers={**h, "Accept-Language": "ru"})
                assert r.status_code == 403
                assert r.json()["error"]["code"] == "forbidden"

            # чтение списка — officer+ (clan:members:read)
            assert (await c.get(f"{API}/auth/invites", headers=officer)).status_code == 200
            assert (await c.get(f"{API}/auth/invites", headers=member)).status_code == 403
            assert (await c.get(f"{API}/auth/invites", headers=guest)).status_code == 403

            inv = await c.post(f"{API}/auth/invites",
                               json={"role": "officer", "max_uses": 3}, headers=admin)
            assert inv.status_code == 201
            invite = inv.json()["invite"]
            assert invite["role"] == "officer"
            assert "clan_id" not in invite

            listed = await c.get(f"{API}/auth/invites", headers=admin)
            assert listed.json()["total"] == 1

            # код не может выдавать admin/owner (правило схемы)
            bad_role = await c.post(f"{API}/auth/invites",
                                    json={"role": "admin"}, headers=admin)
            assert bad_role.status_code == 422

            assert (await c.delete(f"{API}/auth/invites/{invite['id']}",
                                   headers=admin)).status_code == 204

            red = await c.post(
                f"{API}/auth/redeem-code",
                json={"code": invite["code"], "user_id": "u1", "display_name": "U"},
                headers={"Accept-Language": "ru"},
            )
            assert red.status_code == 404
            assert red.json()["error"]["message"] == \
                "Пригласительный код не найден или отозван."

    run(main())


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
