"""Этап 2: достижения и серии в профиле, первый проход наград — тихий, новые награды — письмо
и пост в канал, сводка недели — раз в неделю, /profile и /top в Discord."""
from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import respx
from httpx import ASGITransport, AsyncClient
from nacl.signing import SigningKey
from sqlalchemy import delete, func, select, update

from app.api.v1 import game as game_api
from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.core.tenancy import bypass_clan_filter, clan_scope
from app.main import app
from app.models.game_award import GameAward
from app.models.mail import ClanMail
from app.models.rbac import Clan, ClanMembership, User
from app.services import game_notify
from app.services import gamification as game
from tests.conftest import run, seed_clan

API = "/api/v1"
WEBHOOK = "https://discord.com/api/webhooks/123/secret-token-abcd"
KEY = SigningKey.generate()


def auth(user_id: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_access_token(user_id=user_id, clan_id='CLAN_A', role=ClanRole.OFFICER, display_name=user_id.title())}"}


async def interact(c: AsyncClient, name: str, user: str) -> dict:
    body = json.dumps({"type": 2, "guild_id": "G1", "locale": "ru", "member": {"user": {"id": user}}, "data": {"name": name}}).encode()
    sig = KEY.sign(b"1" + body).signature.hex()
    r = await c.post(f"{API}/discord/interactions", content=body, headers={"X-Signature-Ed25519": sig, "X-Signature-Timestamp": "1"})
    return r.json()


async def count(model) -> int:  # noqa: ANN001
    async with AsyncSessionLocal() as s:
        with bypass_clan_filter():
            return (await s.execute(select(func.count()).select_from(model))).scalar_one()


def test_achievements_awards_digest_commands(db, monkeypatch):
    async def no_war() -> None:
        return None

    monkeypatch.setattr(game_api, "current_war", no_war)
    monkeypatch.setattr(game_notify, "current_war", no_war)
    monkeypatch.setattr(settings, "DISCORD_PUBLIC_KEY", KEY.verify_key.encode().hex())
    game.forget("CLAN_A")

    async def main() -> None:
        await seed_clan("CLAN_A")
        async with AsyncSessionLocal() as s:
            await s.execute(update(Clan).where(Clan.id == "CLAN_A").values(discord_guild_id="G1"))
            for uid in ("alice", "bob"):
                s.add(User(id=uid, display_name=uid.title()))
            await s.flush()
            with clan_scope("CLAN_A"):
                s.add(ClanMembership(user_id="alice", role=ClanRole.OFFICER))
                s.add(ClanMembership(user_id="bob", role=ClanRole.MEMBER))
                await s.commit()
        alice, bob = auth("alice"), auth("bob")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            owner = {"Authorization": f"Bearer {issue_access_token(user_id='boss', clan_id='CLAN_A', role=ClanRole.OWNER)}"}
            # язык постов в канал — язык того, кто сохранил настройки
            assert (await c.put(f"{API}/clan/settings", headers=owner | {"X-Locale": "ru"}, json={"discord_webhook_url": WEBHOOK})).status_code == 200
            r = (await c.post(f"{API}/reports", headers=alice, json={"title": "Склад", "lines": [{"name": "Rifle", "quantity": 4}]})).json()["report"]
            await c.post(f"{API}/reports/{r['id']}/progress", headers=bob, json={"lines": [{"line_id": r["lines"][0]["id"], "quantity": 4}]})

            game.forget("CLAN_A")
            prof = (await c.get(f"{API}/clan/game/members/bob", headers=alice)).json()
            ach = {a["key"]: a for a in prof["achievements"]}
            assert ach["first_delivery"]["level"] == 1 and ach["closer"]["level"] == 1
            assert (ach["hauler"]["level"], ach["hauler"]["value"], ach["hauler"]["target"]) == (0, 4, 100)
            assert prof["streak"] == {"current": 1, "best": 1}

            # первый проход — тихий: награды отмечены, писем и постов нет
            with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
                hook = mock.post(WEBHOOK).respond(204)
                assert await game_notify.check_clan("CLAN_A", now=datetime(2026, 10, 28, 12, tzinfo=UTC)) > 0
                assert not hook.called
            assert await count(ClanMail) == 0

            # новая награда — письмо и пост «закрыл заказ» (редкое) в канал
            async with AsyncSessionLocal() as s:
                with clan_scope("CLAN_A"):
                    await s.execute(delete(GameAward).where(GameAward.key == "ach:closer:1"))
                    await s.commit()
            with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
                hook = mock.post(WEBHOOK).respond(204)
                assert await game_notify.check_clan("CLAN_A", now=datetime(2026, 10, 28, 12, tzinfo=UTC)) == 1
                assert hook.called and "Bob" in hook.calls.last.request.content.decode()
            mail = (await c.get(f"{API}/mail", headers=bob)).json()["items"]
            assert [(m["kind"], m["payload"]["key"]) for m in mail] == [("game_award", "ach:closer:1")]

            # сводка недели: в понедельник после 9:00 — один раз
            monday = datetime(2026, 11, 2, 10, tzinfo=UTC)
            with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
                hook = mock.post(WEBHOOK).respond(204)
                await game_notify.check_clan("CLAN_A", now=monday)
                await game_notify.check_clan("CLAN_A", now=monday + timedelta(hours=1))
                assert hook.call_count == 1
                assert "Итоги недели" in hook.calls.last.request.content.decode()

            # /top — для всех, /profile — только себе
            top = await interact(c, "top", "bob")
            assert top["type"] == 4 and "flags" not in top["data"] and "Bob" in top["data"]["embeds"][0]["description"]
            me = await interact(c, "profile", "bob")
            assert me["data"]["flags"] == 64 and me["data"]["embeds"][0]["title"] == "Bob"
            assert any("Закрыл заказ" in f["value"] for f in me["data"]["embeds"][0]["fields"])

    run(main())


def test_streak_rest_day():
    today = datetime.now(UTC)
    days = [0, 1, 3, 4]          # вчера пропуск (2 дня назад) — прощается раз в неделю
    items = [game.Credit("u", today - timedelta(days=d), "delivery", 1) for d in days]
    st = game.streak(items, "u")
    assert st["current"] >= 4 and st["best"] >= 4
