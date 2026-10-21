"""Раздел «Ваш клан»: профиль клана и описание складов (город, тип, пароль)."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.main import app
from tests.conftest import bearer, run, seed_clan

API = "/api/v1"


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def test_clan_profile_and_stockpile_details(db):
    async def main() -> None:
        await seed_clan("CLAN_A", name="Alpha")
        member = bearer(clan_id="CLAN_A", role=ClanRole.MEMBER)
        async with client() as c:
            r = await c.get(f"{API}/clan/profile", headers=member)
            assert r.status_code == 200, r.text
            assert r.json()["name"] == "Alpha" and r.json()["stockpiles"] == 0

            created = await c.post(f"{API}/stockpiles", headers=member, json={
                "name": "Port Kirknell", "region": "The Moors", "town": "Kirknell", "kind": "seaport", "access_code": "123456",
            })
            assert created.status_code == 201, created.text
            sp = created.json()["stockpile"]
            assert (sp["town"], sp["kind"], sp["access_code"]) == ("Kirknell", "seaport", "123456")

            patched = await c.patch(f"{API}/stockpiles/{sp['id']}", headers=member, json={"kind": "depot", "access_code": "654321"})
            assert patched.json()["stockpile"]["kind"] == "depot" and patched.json()["stockpile"]["access_code"] == "654321"
            assert (await c.patch(f"{API}/stockpiles/{sp['id']}", headers=member, json={"kind": "castle"})).status_code == 422
            assert (await c.get(f"{API}/clan/profile", headers=member)).json()["stockpiles"] == 1

            token = issue_access_token(user_id="guest-1", clan_id="__guest__", role=ClanRole.GUEST, guest=True)
            guest = await c.get(f"{API}/clan/profile", headers={"Authorization": f"Bearer {token}"})
            assert guest.status_code in (401, 403)

    run(main())
