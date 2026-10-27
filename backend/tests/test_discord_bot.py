"""Бот Discord: подпись Interactions, «Взять себе», «Привёз» (выбор строки → форма), /мои-задачи,
пост заказа ботом с кнопками и обновление поста после действий на сайте."""
from __future__ import annotations

import json
import uuid

import respx
from httpx import ASGITransport, AsyncClient, Response
from nacl.signing import SigningKey
from sqlalchemy import select, update

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.core.tenancy import bypass_clan_filter, clan_scope
from app.main import app
from app.models.rbac import Clan, ClanMembership, User
from app.models.report import OrderReport
from tests.conftest import run, seed_clan

API = "/api/v1"
KEY = SigningKey.generate()
WEBHOOK = "https://discord.com/api/webhooks/123/secret-token-abcd"
BOT_API = "https://discord.com/api/v10"


def auth(user_id: str, role: ClanRole, name: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_access_token(user_id=user_id, clan_id='CLAN_A', role=role, display_name=name)}"}


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def interact(c: AsyncClient, payload: dict, *, key: SigningKey = KEY) -> Response:
    body = json.dumps(payload).encode()
    ts = "1700000000"
    sig = key.sign(ts.encode() + body).signature.hex()
    return await c.post(f"{API}/discord/interactions", content=body,
                        headers={"X-Signature-Ed25519": sig, "X-Signature-Timestamp": ts, "Content-Type": "application/json"})


def press(user: str, custom_id: str, **data) -> dict:
    return {"type": 3, "guild_id": "G1", "locale": "ru",
            "member": {"user": {"id": user, "username": user, "global_name": user.title()}},
            "data": {"custom_id": custom_id, "component_type": 2, **data}}


def modal(user: str, custom_id: str, qty: str, place: str = "") -> dict:
    return {"type": 5, "guild_id": "G1", "locale": "ru", "member": {"user": {"id": user, "global_name": user.title()}},
            "data": {"custom_id": custom_id, "components": [
                {"type": 1, "components": [{"type": 4, "custom_id": "qty", "value": qty}]},
                {"type": 1, "components": [{"type": 4, "custom_id": "place", "value": place}]},
            ]}}


async def seed() -> None:
    await seed_clan("CLAN_A")
    async with AsyncSessionLocal() as s:
        await s.execute(update(Clan).where(Clan.id == "CLAN_A").values(discord_guild_id="G1"))
        for uid, name in [("boss", "Boss"), ("tank", "Tank"), ("rookie", "Rookie")]:
            s.add(User(id=uid, display_name=name))
        await s.flush()
        with clan_scope("CLAN_A"):
            s.add(ClanMembership(user_id="boss", role=ClanRole.OWNER))
            s.add(ClanMembership(user_id="tank", role=ClanRole.MEMBER))
            s.add(ClanMembership(user_id="rookie", role=ClanRole.GUEST))
            await s.commit()


def test_interactions_take_deliver_and_my_tasks(db, monkeypatch):
    monkeypatch.setattr(settings, "DISCORD_PUBLIC_KEY", KEY.verify_key.encode().hex())

    async def main() -> None:
        await seed()
        boss = auth("boss", ClanRole.OWNER, "Boss")
        async with client() as c:
            # подпись обязательна; PING — ответ PONG
            assert (await interact(c, {"type": 1}, key=SigningKey.generate())).status_code == 401
            assert (await interact(c, {"type": 1})).json() == {"type": 1}

            report = (await c.post(f"{API}/reports", headers=boss, json={"title": "Фронт", "lines": [
                {"name": "Rifle", "quantity": 10, "unit": "crate"}, {"name": "Bandages", "quantity": 5, "unit": "crate"},
            ]})).json()["report"]
            rid, rifle = report["id"], report["lines"][0]["id"]

            # «Взять себе» — исполнитель; повторно — отказ
            r = (await interact(c, press("tank", f"order:take:{rid}"))).json()
            assert r["type"] == 4 and r["data"]["flags"] == 64 and "Фронт" in r["data"]["content"]
            assert [a["user_id"] for a in (await c.get(f"{API}/reports/{rid}", headers=boss)).json()["assignees"]] == ["tank"]
            assert "отказались" in (await interact(c, press("tank", f"order:take:{rid}"))).json()["data"]["content"]
            assert (await c.get(f"{API}/reports/{rid}", headers=boss)).json()["assignees"] == []

            # не вступил в клан на сайте — ссылка на вход; гость не может отметить доставку
            assert "?tab=clan&view=reports&order=" in (await interact(c, press("stranger", f"order:take:{rid}"))).json()["data"]["content"]
            assert "нет права" in (await interact(c, press("rookie", f"order:deliver:{rid}"))).json()["data"]["content"]

            # «Привёз»: строк две — выбор строки, затем форма количества
            r = (await interact(c, press("tank", f"order:deliver:{rid}"))).json()
            options = r["data"]["components"][0]["components"][0]["options"]
            assert r["data"]["flags"] == 64 and [o["label"] for o in options] == ["Rifle", "Bandages"]
            r = (await interact(c, press("tank", f"order:line:{rid}", values=[rifle], component_type=3))).json()
            assert r["type"] == 9 and r["data"]["custom_id"] == f"order:qty:{rid}:{rifle}"
            assert r["data"]["components"][0]["components"][0]["value"] == "10"

            assert "целым числом" in (await interact(c, modal("tank", f"order:qty:{rid}:{rifle}", "abc"))).json()["data"]["content"]
            r = (await interact(c, modal("tank", f"order:qty:{rid}:{rifle}", "3", "BB"))).json()
            assert r["type"] == 4 and r["data"]["content"].startswith("✅")
            progress = (await c.get(f"{API}/reports/{rid}/progress", headers=boss)).json()
            assert progress["delivered_total"] == 3 and progress["contributions"][0]["user_name"] == "Tank"
            assert progress["contributions"][0]["stockpile_label"] == "BB"
            feed = (await c.get(f"{API}/reports/{rid}/events", headers=boss)).json()
            assert feed[0]["kind"] == "contribution" and feed[0]["actor_name"] == "Tank"

            # /мои-задачи — только свои активные заказы этого сервера
            command = {"type": 2, "guild_id": "G1", "locale": "ru", "member": {"user": {"id": "tank"}}, "data": {"name": "my-tasks"}}
            assert "нет активных" in (await interact(c, command)).json()["data"]["content"]
            await interact(c, press("tank", f"order:take:{rid}"))
            embed = (await interact(c, command)).json()["data"]["embeds"][0]
            assert "Фронт" in embed["description"] and "20%" in embed["description"]
            assert "не привязан" in (await interact(c, {**command, "guild_id": "OTHER"})).json()["data"]["content"]

    run(main())


def test_bot_posts_order_with_buttons_and_refreshes_it(db, monkeypatch):
    monkeypatch.setattr(settings, "DISCORD_BOT_TOKEN", "bot-token")

    async def main() -> None:
        await seed()
        boss = auth("boss", ClanRole.OWNER, "Boss")
        async with client() as c:
            assert (await c.put(f"{API}/clan/settings", headers=boss, json={"discord_webhook_url": WEBHOOK})).status_code == 200
            rid = (await c.post(f"{API}/reports", headers=boss, json={"title": "Склад", "lines": [
                {"name": "Rifle", "quantity": 4, "unit": "crate"}]})).json()["report"]["id"]

            with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
                mock.get(WEBHOOK).respond(200, json={"id": "123", "channel_id": "C1", "guild_id": "G1"})
                post = mock.post(f"{BOT_API}/channels/C1/messages").respond(200, json={"id": "M1"})
                hook = mock.post(WEBHOOK).respond(204)
                assert (await c.post(f"{API}/reports/{rid}/discord", headers=boss)).status_code == 200
                assert post.called and not hook.called
                sent = json.loads(post.calls.last.request.content)
                ids = [b.get("custom_id") for b in sent["components"][0]["components"]]
                assert ids == [f"order:take:{rid}", f"order:deliver:{rid}", None]
                assert sent["components"][0]["components"][2]["url"].endswith(f"order={rid}")

            async with AsyncSessionLocal() as s:
                with bypass_clan_filter():
                    row = (await s.execute(select(OrderReport).where(OrderReport.id == uuid.UUID(rid)))).scalar_one()
                assert (row.discord_channel_id, row.discord_message_id) == ("C1", "M1")

            # действие на сайте — пост в Discord обновляется (прогресс, исполнители)
            with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
                edit = mock.patch(f"{BOT_API}/channels/C1/messages/M1").respond(200, json={"id": "M1"})
                assert (await c.post(f"{API}/reports/{rid}/take", headers=boss, json={"take": True})).status_code == 200
                assert edit.called
                embed = json.loads(edit.calls.last.request.content)["embeds"][0]
                assert any("<@boss>" in f["value"] for f in embed["fields"])

            # нет доступа к каналу — заказ уходит старым путём, через вебхук
            with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
                mock.get(WEBHOOK).respond(200, json={"id": "123", "channel_id": "C2"})
                mock.post(f"{BOT_API}/channels/C2/messages").respond(403, json={"message": "Missing Access"})
                hook = mock.post(WEBHOOK).respond(204)
                assert (await c.post(f"{API}/reports/{rid}/discord", headers=boss)).status_code == 200
                assert hook.called

    run(main())
