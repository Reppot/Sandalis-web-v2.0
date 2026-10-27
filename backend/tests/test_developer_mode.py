"""Режим разработчика: владелец сайта (FEEDBACK_ADMIN_IDS) видит все кланы и входит в любой
с правами командира; остальным — 403; убрали из списка — его вход в клан больше не действует."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.core.tenancy import clan_scope
from app.main import app
from app.models.rbac import ClanMembership, User
from tests.conftest import run, seed_clan

API = "/api/v1"


def auth(user_id: str, role: ClanRole, clan: str = "CLAN_A") -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_access_token(user_id=user_id, clan_id=clan, role=role, display_name=user_id.title())}"}


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def test_developer_enters_any_clan_as_commander(db, monkeypatch):
    monkeypatch.setattr(settings, "FEEDBACK_ADMIN_IDS", "dev-1")

    async def main() -> None:
        await seed_clan("CLAN_A", "Alpha")
        await seed_clan("CLAN_B", "Imperiallis [SINDARIS]")
        async with AsyncSessionLocal() as s:
            s.add(User(id="eve", display_name="Eve"))
            await s.flush()
            with clan_scope("CLAN_B"):
                s.add(ClanMembership(user_id="eve", role=ClanRole.OWNER))
                await s.commit()

        dev, member = auth("dev-1", ClanRole.MEMBER), auth("joe", ClanRole.OFFICER)
        async with client() as c:
            assert (await c.get(f"{API}/auth/me", headers=dev)).json()["site_admin"] is True
            assert (await c.get(f"{API}/auth/me", headers=member)).json()["site_admin"] is False
            assert (await c.get(f"{API}/auth/developer/clans", headers=member)).status_code == 403
            assert (await c.post(f"{API}/auth/developer/enter", headers=member, json={"clan_id": "CLAN_B"})).status_code == 403

            clans = (await c.get(f"{API}/auth/developer/clans", headers=dev)).json()
            assert [(x["id"], x["members"]) for x in clans] == [("CLAN_A", 0), ("CLAN_B", 1)]
            assert (await c.post(f"{API}/auth/developer/enter", headers=dev, json={"clan_id": "NOPE"})).status_code == 404

            r = await c.post(f"{API}/auth/developer/enter", headers=dev, json={"clan_id": "CLAN_B"})
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["me"]["clan_id"] == "CLAN_B" and body["me"]["role"] == "owner" and body["me"]["developer"] is True
            assert "Imperiallis" in body["message"]
            entered = {"Authorization": f"Bearer {body['access_token']}"}
            me = (await c.get(f"{API}/auth/me", headers=entered)).json()
            assert me["developer"] is True and me["scopes"] == ["*"]
            # разделы только для командира — доступны
            assert (await c.get(f"{API}/clan/permissions", headers=entered)).status_code == 200
            assert (await c.get(f"{API}/clan/settings", headers=entered)).status_code == 200

        # разработчика убрали из списка — токен режима разработчика больше не действует
        monkeypatch.setattr(settings, "FEEDBACK_ADMIN_IDS", "")
        async with client() as c:
            assert (await c.get(f"{API}/auth/me", headers=entered)).status_code == 401

    run(main())
