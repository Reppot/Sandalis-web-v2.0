"""Скрытые роли: командир убирает «мусорные» роли — их нет в списке, уровни сброшены,
«Подтянуть роли» их не возвращает; вернуть можно; участнику — 403."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient
from sqlalchemy import update

from app.api.v1 import clan_roles
from app.core.db import AsyncSessionLocal
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.core.tenancy import clan_scope
from app.main import app
from app.models.clan_settings import ClanSettings
from app.models.rbac import Clan
from tests.conftest import run, seed_clan

API = "/api/v1"
ROLES = [{"id": "1", "name": "Офицеры", "color": 0, "position": 3},
         {"id": "2", "name": "Мусор", "color": 0, "position": 2},
         {"id": "3", "name": "Бот-роль", "color": 0, "position": 1}]


def auth(user_id: str, role: ClanRole) -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_access_token(user_id=user_id, clan_id='CLAN_A', role=role, display_name=user_id)}"}


def test_hide_pull_and_unhide_roles(db, monkeypatch):
    async def fake_roles(guild_id: str) -> list[dict]:
        return [dict(r) for r in ROLES]

    monkeypatch.setattr(clan_roles, "fetch_guild_roles", fake_roles)

    async def main() -> None:
        await seed_clan("CLAN_A")
        async with AsyncSessionLocal() as s:
            await s.execute(update(Clan).where(Clan.id == "CLAN_A").values(discord_guild_id="G1"))
            with clan_scope("CLAN_A"):
                s.add(ClanSettings(discord_roles=[dict(r) for r in ROLES], discord_role_map={"1": "medium", "2": "high"}))
                await s.commit()

        boss = auth("boss", ClanRole.OWNER)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            assert (await c.post(f"{API}/clan/discord-roles/hide", headers=auth("joe", ClanRole.ADMIN), json={"role_ids": ["2"]})).status_code == 403

            r = await c.post(f"{API}/clan/discord-roles/hide", headers=boss, json={"role_ids": ["2", "3"]})
            assert r.status_code == 200, r.text
            roles = r.json()["roles"]
            assert [x["id"] for x in roles["roles"]] == ["1"] and roles["roles"][0]["level"] == "medium"
            assert [h["name"] for h in roles["hidden"]] == ["Бот-роль", "Мусор"]

            # «Подтянуть роли» скрытые не возвращает
            r = await c.post(f"{API}/clan/discord-roles/pull", headers=boss)
            assert [x["id"] for x in r.json()["roles"]["roles"]] == ["1"]
            # роль, у которой был уровень, его потеряла — вернётся базовой
            r = await c.delete(f"{API}/clan/discord-roles/hide/2", headers=boss)
            assert [h["id"] for h in r.json()["roles"]["hidden"]] == ["3"]
            roles = (await c.post(f"{API}/clan/discord-roles/pull", headers=boss)).json()["roles"]["roles"]
            assert {x["id"]: x["level"] for x in roles} == {"1": "medium", "2": "basic"}

            # «@» больше не подсказывает скрытую роль
            names = [m["name"] for m in (await c.get(f"{API}/clan/mentions", headers=boss)).json()]
            assert "Бот-роль" not in names and "Мусор" in names

    run(main())
