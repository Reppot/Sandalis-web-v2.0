"""Этап 3: настройки командира (веса, исключённые роли, выключение), цель недели, отряды,
смена войны → Зал славы, роли лиг в Discord."""
from __future__ import annotations

from datetime import UTC, datetime

import respx
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update

from app.api.v1 import game as game_api
from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.core.tenancy import clan_scope
from app.main import app
from app.models.clan_settings import ClanSettings
from app.models.rbac import Clan, ClanMembership, User
from app.services import game_notify
from app.services import gamification as game
from tests.conftest import run, seed_clan

API = "/api/v1"
BOT = "https://discord.com/api/v10"
WAR = {"n": 142}


def auth(user_id: str, role: ClanRole = ClanRole.OFFICER) -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_access_token(user_id=user_id, clan_id='CLAN_A', role=role, display_name=user_id.title())}"}


async def fake_war() -> dict:
    return {"warNumber": WAR["n"], "conquestStartTime": datetime(2026, 10, 1, tzinfo=UTC).timestamp() * 1000}


def test_settings_goal_squads_hall_roles(db, monkeypatch):
    monkeypatch.setattr(game_api, "current_war", fake_war)
    monkeypatch.setattr(game_notify, "current_war", fake_war)
    game.forget("CLAN_A")

    async def main() -> None:
        await seed_clan("CLAN_A")
        async with AsyncSessionLocal() as s:
            await s.execute(update(Clan).where(Clan.id == "CLAN_A").values(discord_guild_id="G1"))
            for uid in ("alice", "bob", "boss"):
                s.add(User(id=uid, display_name=uid.title()))
            await s.flush()
            with clan_scope("CLAN_A"):
                s.add(ClanSettings(discord_roles=[{"id": "55", "name": "Логисты", "color": 1}, {"id": "77", "name": "Боты", "color": 0}]))
                s.add(ClanMembership(user_id="boss", role=ClanRole.OWNER))
                s.add(ClanMembership(user_id="alice", role=ClanRole.OFFICER, discord_role_ids=["55"]))
                s.add(ClanMembership(user_id="bob", role=ClanRole.MEMBER, discord_role_ids=["55", "77"]))
                await s.commit()
        boss, alice, bob = auth("boss", ClanRole.OWNER), auth("alice"), auth("bob", ClanRole.MEMBER)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = (await c.post(f"{API}/reports", headers=boss, json={"title": "Фронт", "lines": [{"name": "Rifle", "quantity": 20}]})).json()["report"]
            line = r["lines"][0]["id"]
            await c.post(f"{API}/reports/{r['id']}/progress", headers=bob, json={"lines": [{"line_id": line, "quantity": 4}]})
            await c.post(f"{API}/reports/{r['id']}/progress", headers=alice, json={"lines": [{"line_id": line, "quantity": 2}]})

            # настройки — только командир
            assert (await c.get(f"{API}/clan/game/settings", headers=alice)).status_code == 403
            cfg = (await c.get(f"{API}/clan/game/settings", headers=boss)).json()
            assert cfg["enabled"] is True and cfg["weights"]["crate"] == 1 and {x["id"] for x in cfg["roles"]} == {"55", "77"}

            # свой вес ящика ×2 + цель недели 5 ящиков + отряд «Логисты»
            r = await c.put(f"{API}/clan/game/settings", headers=boss, json={**cfg, "weights": {"crate": 2}, "weekly_goal": 5, "squads": ["55", "zzz"]})
            assert r.status_code == 200 and r.json()["squads"] == ["55"]
            board = (await c.get(f"{API}/clan/game", headers=alice, params={"period": "all"})).json()
            assert [(x["user_id"], x["value"]) for x in board["rows"]] == [("bob", 8.0), ("alice", 4.0)]
            summ = (await c.get(f"{API}/clan/game/summary", headers=alice)).json()
            assert summ["goal"]["progress"] == 6 and summ["goal"]["done"] is True
            assert summ["squads"][0]["name"] == "Логисты" and summ["squads"][0]["active"] == 2 and summ["squads"][0]["per_active"] == 6.0

            # роль «Боты» исключена — bob пропадает из рейтинга
            await c.put(f"{API}/clan/game/settings", headers=boss, json={**cfg, "excluded_roles": ["77"]})
            board = (await c.get(f"{API}/clan/game", headers=alice, params={"period": "all"})).json()
            assert [x["user_id"] for x in board["rows"]] == ["alice"]

            # выключено — рейтинг 404, значков нет
            await c.put(f"{API}/clan/game/settings", headers=boss, json={**cfg, "enabled": False})
            assert (await c.get(f"{API}/clan/game", headers=alice)).status_code == 404
            assert (await c.get(f"{API}/clan/game/badges", headers=alice)).json() == {}
            assert (await c.get(f"{API}/clan/game/summary", headers=alice)).json()["enabled"] is False

            # включаем: цель 5, роли лиг; первый проход — сезон 142 и цель недели
            await c.put(f"{API}/clan/game/settings", headers=boss, json={**cfg, "weekly_goal": 5, "league_roles": True})
            monkeypatch.setattr(settings, "DISCORD_BOT_TOKEN", "bot")
            with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
                created = mock.post(f"{BOT}/guilds/G1/roles").respond(200, json={"id": "900"})
                given = mock.put(url__regex=rf"{BOT}/guilds/G1/members/.+/roles/900").respond(204)
                await game_notify.check_clan("CLAN_A")
                assert created.call_count == len(game.LEAGUES) and given.call_count == 2
            prof = (await c.get(f"{API}/clan/game/members/alice", headers=alice)).json()
            assert prof["goals"] == 1

            # новая война — итоги прошлой в Зал славы, место у лучшего
            WAR["n"] = 143
            with respx.mock(assert_all_mocked=False, assert_all_called=False):
                await game_notify.check_clan("CLAN_A")
            summ = (await c.get(f"{API}/clan/game/summary", headers=alice)).json()
            assert summ["hall"][0]["war"] == 142 and summ["hall"][0]["top"][0]["user_id"] == "bob"
            assert (await c.get(f"{API}/clan/game/members/bob", headers=alice)).json()["trophies"] == [{"war": 142, "place": 1}]

    run(main())
