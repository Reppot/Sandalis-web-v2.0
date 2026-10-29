"""Чёрный список клана: участники и роли Discord — снимается членство, сессия перестаёт
действовать, командира добавить нельзя, правит только командир."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.db import AsyncSessionLocal
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.core.tenancy import clan_scope
from app.main import app
from app.models.rbac import ClanMembership, User
from app.services.blacklist import blocks
from tests.conftest import run, seed_clan

API = "/api/v1"


def auth(user_id: str, role: ClanRole) -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_access_token(user_id=user_id, clan_id='CLAN_A', role=role, display_name=user_id)}"}


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def seed() -> None:
    await seed_clan("CLAN_A")
    async with AsyncSessionLocal() as s:
        for uid, name in [("111", "Boss"), ("222", "Tank"), ("333", "Logi")]:
            s.add(User(id=uid, display_name=name))
        await s.flush()
        with clan_scope("CLAN_A"):
            s.add(ClanMembership(user_id="111", role=ClanRole.OWNER))
            s.add(ClanMembership(user_id="222", role=ClanRole.MEMBER, discord_role_ids=["700"]))
            s.add(ClanMembership(user_id="333", role=ClanRole.MEMBER, discord_role_ids=["800", "900"]))
            await s.commit()


def test_blacklist_users_and_roles(db):
    async def main() -> None:
        await seed()
        boss, tank, logi = auth("111", ClanRole.OWNER), auth("222", ClanRole.MEMBER), auth("333", ClanRole.MEMBER)
        async with client() as c:
            assert (await c.get(f"{API}/clan/blacklist", headers=tank)).status_code == 403
            assert (await c.get(f"{API}/clan/blacklist", headers=boss)).json() == {"users": [], "roles": []}
            # командира — нельзя
            r = await c.put(f"{API}/clan/blacklist", headers=boss, json={"users": [{"id": "111"}], "roles": []})
            assert r.status_code == 422

            # участник: снято членство, сессия больше не действует
            r = await c.put(f"{API}/clan/blacklist", headers=boss, json={"users": [{"id": "222", "reason": "слив склада"}], "roles": []})
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["removed"] == 1
            [entry] = body["blacklist"]["users"]
            assert (entry["id"], entry["name"], entry["reason"], entry["by"]) == ("222", "Tank", "слив склада", "111")
            r = await c.get(f"{API}/auth/me", headers=tank)
            assert r.status_code == 401 and r.json()["error"]["code"] == "blacklisted"
            assert (await c.get(f"{API}/auth/me", headers=logi)).status_code == 200

            # роль: закрывает всех её носителей, даже с другими ролями
            r = await c.put(f"{API}/clan/blacklist", headers=boss, json={"users": [{"id": "222"}], "roles": ["800"]})
            assert r.json()["removed"] == 1 and r.json()["blacklist"]["users"][0]["reason"] == "слив склада"
            assert (await c.get(f"{API}/auth/me", headers=logi)).status_code == 401
            assert (await c.get(f"{API}/auth/me", headers=boss)).status_code == 200

            # убрали из списка — сессия снова действует (вступить заново — через вход)
            await c.put(f"{API}/clan/blacklist", headers=boss, json={"users": [], "roles": []})
            assert (await c.get(f"{API}/auth/me", headers=tank)).status_code == 200

    run(main())


def test_blocks_by_id_or_role():
    class Cs:
        blacklist_users = [{"id": "1"}]
        blacklist_roles = ["9"]

    assert blocks(Cs(), "1", []) and blocks(Cs(), "2", ["5", "9"])
    assert not blocks(Cs(), "2", ["5"]) and not blocks(None, "1", ["9"])


def test_audit_log_records_sensitive_actions(db):
    async def main() -> None:
        await seed()
        boss = auth("111", ClanRole.OWNER)
        async with client() as c:
            await c.put(f"{API}/clan/blacklist", headers=boss, json={"users": [{"id": "222", "reason": "x"}], "roles": []})
            await c.put(f"{API}/clan/settings", headers=boss, json={"timer_warn_minutes": 60})
            r = await c.post(f"{API}/reports", headers=boss, json={"title": "Лишний", "lines": [{"name": "Rifle", "quantity": 1}]})
            await c.delete(f"{API}/reports/{r.json()['report']['id']}", headers=boss)
            assert (await c.get(f"{API}/clan/audit", headers=auth("333", ClanRole.MEMBER))).status_code in (401, 403)
            log = (await c.get(f"{API}/clan/audit", headers=boss)).json()
            assert [e["action"] for e in log] == ["orders.delete", "settings.update", "blacklist.save"]
            assert log[0]["details"] == {"title": "Лишний"} and log[1]["details"] == {"timer_minutes": 60}
            assert log[2]["details"]["users"] == ["Tank"] and log[2]["actor_id"] == "111"

    run(main())
