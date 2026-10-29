"""Операции в Discord: пост с кнопками, ветка и событие сервера; кнопка «Буду» записывает
в явку; напоминание за час — пинг записавшихся в ветке, один раз; удаление убирает пост и событие."""
from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import respx
from httpx import ASGITransport, AsyncClient
from nacl.signing import SigningKey
from sqlalchemy import update

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.core.tenancy import clan_scope
from app.main import app
from app.models.rbac import Clan, ClanMembership, User
from app.services import discord_ops
from tests.conftest import run, seed_clan

API = "/api/v1"
BOT = "https://discord.com/api/v10"
WEBHOOK = "https://discord.com/api/webhooks/123/secret-token-abcd"
KEY = SigningKey.generate()


def test_operation_post_buttons_reminder_delete(db, monkeypatch):
    monkeypatch.setattr(settings, "DISCORD_BOT_TOKEN", "bot")
    monkeypatch.setattr(settings, "DISCORD_PUBLIC_KEY", KEY.verify_key.encode().hex())

    async def main() -> None:
        await seed_clan("CLAN_A")
        async with AsyncSessionLocal() as s:
            await s.execute(update(Clan).where(Clan.id == "CLAN_A").values(discord_guild_id="G1"))
            s.add(User(id="bob", display_name="Bob"))
            await s.flush()
            with clan_scope("CLAN_A"):
                s.add(ClanMembership(user_id="bob", role=ClanRole.MEMBER))
                await s.commit()
        boss = {"Authorization": f"Bearer {issue_access_token(user_id='boss', clan_id='CLAN_A', role=ClanRole.OWNER, display_name='Boss')}"}
        start = datetime.now(UTC) + timedelta(minutes=50)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            assert (await c.put(f"{API}/clan/settings", headers=boss | {"X-Locale": "ru"}, json={"discord_webhook_url": WEBHOOK})).status_code == 200
            with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
                mock.get(WEBHOOK).respond(200, json={"channel_id": "C1"})
                post = mock.post(f"{BOT}/channels/C1/messages").respond(200, json={"id": "M1"})
                thread = mock.post(f"{BOT}/channels/C1/messages/M1/threads").respond(201, json={"id": "T1"})
                event = mock.post(f"{BOT}/guilds/G1/scheduled-events").respond(200, json={"id": "E1"})
                op = (await c.post(f"{API}/clan/operations", headers=boss, json={
                    "title": "Штурм", "date": start.date().isoformat(), "note": "сбор у базы", "starts_at": start.isoformat()})).json()
                assert op["starts_at"] and post.called and thread.called and event.called
                sent = json.loads(post.calls.last.request.content)
                assert [b.get("custom_id") for b in sent["components"][0]["components"]][:2] == [f"op:go:{op['id']}", f"op:no:{op['id']}"]

            # кнопка «Буду» → явка на сайте и обновлённый пост
            body = json.dumps({"type": 3, "guild_id": "G1", "locale": "ru", "member": {"user": {"id": "bob", "global_name": "Bob"}},
                               "data": {"custom_id": f"op:go:{op['id']}", "component_type": 2}}).encode()
            with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
                edit = mock.patch(f"{BOT}/channels/C1/messages/M1").respond(200, json={"id": "M1"})
                mock.patch(f"{BOT}/guilds/G1/scheduled-events/E1").respond(200, json={"id": "E1"})
                r = (await c.post(f"{API}/discord/interactions", content=body, headers={
                    "X-Signature-Ed25519": KEY.sign(b"1" + body).signature.hex(), "X-Signature-Timestamp": "1"})).json()
                assert "Штурм" in r["data"]["content"] and edit.called
            ops = (await c.get(f"{API}/clan/operations", headers=boss)).json()["operations"]
            assert [p["user_id"] for p in ops[0]["participants"]] == ["bob"]

            # за час до начала — пинг записавшихся в ветке, один раз
            with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
                ping = mock.post(f"{BOT}/channels/T1/messages").respond(200, json={"id": "X"})
                assert await discord_ops.remind() == 1
                assert await discord_ops.remind() == 0
                msg = json.loads(ping.calls.last.request.content)
                assert msg["content"].startswith("<@bob>") and msg["allowed_mentions"] == {"users": ["bob"]}

            # удаление — пост и событие убираются
            with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
                gone = mock.delete(f"{BOT}/channels/C1/messages/M1").respond(204)
                gone_event = mock.delete(f"{BOT}/guilds/G1/scheduled-events/E1").respond(204)
                assert (await c.delete(f"{API}/clan/operations/{op['id']}", headers=boss)).status_code == 204
                assert gone.called and gone_event.called

    run(main())
