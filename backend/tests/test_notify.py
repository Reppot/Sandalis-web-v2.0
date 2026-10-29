"""Уведомления вне сайта: согласие на ЛС, подписка браузера, рассылка новых писем один раз,
текст на языке получателя, мёртвые push-подписки удаляются."""
from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import respx
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.core.tenancy import bypass_clan_filter
from app.main import app
from app.models.mail import ClanMail
from app.models.push import PushSubscription
from app.models.rbac import User
from app.services import notify_dispatch
from tests.conftest import run, seed_clan

API = "/api/v1"
BOT = "https://discord.com/api/v10"


def auth(uid: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_access_token(user_id=uid, clan_id='CLAN_A', role=ClanRole.MEMBER, display_name=uid)}"}


def test_dm_and_push_dispatch(db, monkeypatch):
    monkeypatch.setattr(settings, "DISCORD_BOT_TOKEN", "bot")
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "pub")
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "priv")
    pushed: list[tuple[str, dict]] = []

    def fake_push(sub, payload):  # noqa: ANN001
        pushed.append((sub.endpoint, json.loads(payload)))
        return 410 if "dead" in sub.endpoint else 201

    monkeypatch.setattr(notify_dispatch, "_push_one", fake_push)

    async def main() -> None:
        await seed_clan("CLAN_A")
        async with AsyncSessionLocal() as s:
            s.add(User(id="111", display_name="Bob", preferred_locale="ru"))
            s.add(User(id="222", display_name="Ann", preferred_locale="en"))
            await s.commit()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            st = (await c.get(f"{API}/notify", headers=auth("111"))).json()
            assert st == {"dm": False, "dm_available": True, "push_key": "pub", "push_devices": 0}
            assert (await c.put(f"{API}/notify", headers=auth("111"), json={"dm": True})).json()["dm"] is True
            keys = {"p256dh": "k" * 20, "auth": "a" * 8}
            await c.post(f"{API}/notify/push", headers=auth("222"), json={"endpoint": "https://push.example/ok", "keys": keys})
            r = await c.post(f"{API}/notify/push", headers=auth("222"), json={"endpoint": "https://push.example/dead", "keys": keys})
            assert r.json()["push_devices"] == 2

        now = datetime.now(UTC)
        async with AsyncSessionLocal() as s:
            with bypass_clan_filter():
                s.add(ClanMail(clan_id="CLAN_A", recipient_id="111", sender_id="x", sender_name="Boss", kind="task_assigned", payload={"title": "Фронт"}))
                s.add(ClanMail(clan_id="CLAN_A", recipient_id="222", sender_id="system", sender_name="SINDARIS", kind="timer_expired", payload={"title": "Sind-1"}))
                s.add(ClanMail(clan_id="CLAN_A", recipient_id="222", sender_id="x", sender_name="x", kind="task_due",
                               payload={"title": "old"}, created_at=now - timedelta(days=3)))
                await s.commit()

        with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
            mock.post(f"{BOT}/users/@me/channels").respond(200, json={"id": "DM1"})
            dm = mock.post(f"{BOT}/channels/DM1/messages").respond(200, json={"id": "X"})
            assert await notify_dispatch.dispatch() == 2          # ЛС Бобу + один живой push Анне
            assert "Boss назначил(а) вам заказ «Фронт»" in json.loads(dm.calls.last.request.content)["content"]
            assert await notify_dispatch.dispatch() == 0          # второй проход — ничего
        assert {(e, p["body"]) for e, p in pushed} == {("https://push.example/ok", "Reserve “Sind-1” has expired!"),
                                                       ("https://push.example/dead", "Reserve “Sind-1” has expired!")}
        async with AsyncSessionLocal() as s:
            assert (await s.execute(select(func.count()).select_from(PushSubscription))).scalar_one() == 1

    run(main())
