"""Напоминания о резервах: «скоро истечёт» и «истёк» — письма и канал Discord, по разу на срок;
кнопка «Обновил резерв» сбрасывает таймер; давно истёкшие — без запоздалых писем."""
from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

import respx
from httpx import ASGITransport, AsyncClient
from nacl.signing import SigningKey

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.core.tenancy import clan_scope
from app.main import app
from app.models.rbac import ClanMembership, User
from app.services import timer_alerts
from tests.conftest import run, seed_clan

API = "/api/v1"
WEBHOOK = "https://discord.com/api/webhooks/123/secret-token-abcd"
KEY = SigningKey.generate()


def auth(user_id: str, role: ClanRole, name: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_access_token(user_id=user_id, clan_id='CLAN_A', role=role, display_name=name)}"}


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def seed() -> None:
    await seed_clan("CLAN_A")
    async with AsyncSessionLocal() as s:
        for uid, name in [("boss", "Boss"), ("tank", "Tank"), ("logi", "Logi")]:
            s.add(User(id=uid, display_name=name))
        await s.flush()
        with clan_scope("CLAN_A"):
            s.add(ClanMembership(user_id="boss", role=ClanRole.OWNER))
            s.add(ClanMembership(user_id="tank", role=ClanRole.MEMBER, discord_role_ids=["901"]))
            s.add(ClanMembership(user_id="logi", role=ClanRole.MEMBER))
            await s.commit()


async def kinds(c: AsyncClient, headers: dict[str, str]) -> list[str]:
    return [m["kind"] for m in (await c.get(f"{API}/mail", headers=headers)).json()["items"]]


def test_timer_reminders_mail_discord_and_reset(db, monkeypatch):
    monkeypatch.setattr(settings, "DISCORD_PUBLIC_KEY", KEY.verify_key.encode().hex())

    async def main() -> None:
        await seed()
        boss, tank, logi = auth("boss", ClanRole.OWNER, "Boss"), auth("tank", ClanRole.MEMBER, "Tank"), auth("logi", ClanRole.MEMBER, "Logi")
        async with client() as c:
            r = await c.put(f"{API}/clan/settings", headers=boss,
                            json={"discord_webhook_url": WEBHOOK, "timer_ping_role_id": "901", "timer_warn_minutes": 120})
            assert r.status_code == 200, r.text
            got = (await c.get(f"{API}/clan/settings", headers=boss)).json()
            assert (got["timer_ping_role_id"], got["timer_warn_minutes"]) == ("901", 120)
            assert (await c.put(f"{API}/clan/settings", headers=boss, json={"timer_warn_minutes": 5})).status_code == 422

            now = datetime.now(UTC)
            timer = (await c.post(f"{API}/timers", headers=boss, json={"title": "Sind-1", "ends_at": (now + timedelta(hours=1)).isoformat()})).json()
            timer = timer.get("timer", timer)
            far = (await c.post(f"{API}/timers", headers=boss, json={"title": "Далёкий", "ends_at": (now + timedelta(hours=10)).isoformat()})).json()
            stale = (await c.post(f"{API}/timers", headers=boss, json={"title": "Старый", "target_timestamp": int((now - timedelta(hours=3)).timestamp() * 1000)})).json()
            assert far and stale

            # за час до конца (порог 2 ч) — предупреждение: автор и носители роли, пинг роли в канале
            with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
                hook = mock.post(WEBHOOK).respond(204)
                assert await timer_alerts.check(now) == 1
                body = json.loads(hook.calls.last.request.content)
                assert body["content"].startswith("<@&901>") and "Sind-1" in body["content"]
                assert body["allowed_mentions"] == {"roles": ["901"]} and "components" not in body
                assert await timer_alerts.check(now) == 0
            assert await kinds(c, boss) == ["timer_warn"] and await kinds(c, tank) == ["timer_warn"]
            assert await kinds(c, logi) == []

            # срок вышел — «истёк», тоже один раз; давно истёкший таймер писем не шлёт
            with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
                mock.post(WEBHOOK).respond(204)
                assert await timer_alerts.check(now + timedelta(hours=1, minutes=1)) == 1
                assert await timer_alerts.check(now + timedelta(hours=1, minutes=2)) == 0
            assert (await kinds(c, tank))[0] == "timer_expired"

            # «Обновил резерв» из Discord: таймер заново на 48 ч, сообщение — отметка без кнопок
            payload = {"type": 3, "guild_id": "G1", "locale": "ru", "member": {"user": {"id": "boss", "global_name": "Boss"}},
                       "data": {"custom_id": f"timer:reset:{timer['id']}", "component_type": 2}}
            raw = json.dumps(payload).encode()
            sig = KEY.sign(b"1" + raw).signature.hex()
            r = (await c.post(f"{API}/discord/interactions", content=raw,
                              headers={"X-Signature-Ed25519": sig, "X-Signature-Timestamp": "1"})).json()
            assert r["type"] == 7 and r["data"]["components"] == [] and r["data"]["embeds"][0]["title"] == "✅ Sind-1"
            fresh = (await c.get(f"{API}/timers/{timer['id']}", headers=boss)).json()
            fresh = fresh.get("timer", fresh)
            assert datetime.fromisoformat(fresh["ends_at"]) > now + timedelta(hours=47)

            # без права сбрасывать таймеры — отказ (гость клана)
            async with AsyncSessionLocal() as s:
                s.add(User(id="rookie", display_name="Rookie"))
                await s.flush()
                with clan_scope("CLAN_A"):
                    s.add(ClanMembership(user_id="rookie", role=ClanRole.GUEST))
                    await s.commit()
            payload["member"]["user"]["id"] = "rookie"
            raw = json.dumps(payload).encode()
            r = (await c.post(f"{API}/discord/interactions", content=raw, headers={
                "X-Signature-Ed25519": KEY.sign(b"1" + raw).signature.hex(), "X-Signature-Timestamp": "1"})).json()
            assert "нет права" in r["data"]["content"]
            assert uuid.UUID(timer["id"])

    run(main())
