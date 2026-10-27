"""Упоминания @роль в заметке операции → письма в почту сайта носителям роли; почта своя."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.db import AsyncSessionLocal
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.core.tenancy import clan_scope
from app.main import app
from app.models.clan_settings import ClanSettings
from app.models.rbac import ClanMembership, User
from tests.conftest import run, seed_clan

ROLES = [{"id": "r-tank", "name": "Танкисты", "color": 255, "position": 2}, {"id": "r-log", "name": "Логисты", "color": 0, "position": 1}]


def auth(user_id: str, role: ClanRole, name: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_access_token(user_id=user_id, clan_id='CLAN_A', role=role, display_name=name)}"}


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def seed() -> None:
    await seed_clan("CLAN_A")
    async with AsyncSessionLocal() as s:
        for uid, name in [("boss", "Boss"), ("tank1", "Tank One"), ("tank2", "Tank Two"), ("log1", "Logi")]:
            s.add(User(id=uid, display_name=name))
        await s.flush()
        with clan_scope("CLAN_A"):
            s.add(ClanSettings(discord_roles=ROLES))
            s.add(ClanMembership(user_id="boss", role=ClanRole.OWNER, discord_role_ids=["r-tank"]))
            s.add(ClanMembership(user_id="tank1", role=ClanRole.MEMBER, discord_role_ids=["r-tank"]))
            s.add(ClanMembership(user_id="tank2", role=ClanRole.MEMBER, discord_role_ids=["r-tank", "r-log"]))
            s.add(ClanMembership(user_id="log1", role=ClanRole.MEMBER, discord_role_ids=["r-log"]))
            await s.commit()


def test_role_mentions_reach_mailboxes(db):
    async def main() -> None:
        await seed()
        boss, tank1, log1 = auth("boss", ClanRole.OWNER, "Boss"), auth("tank1", ClanRole.MEMBER, "Tank One"), auth("log1", ClanRole.MEMBER, "Logi")
        async with client() as c:
            # @everyone в подсказке — только с правом clan:everyone (у командира есть, у участника нет)
            roles = (await c.get("/api/v1/clan/mentions", headers=boss)).json()
            assert [r["name"] for r in roles] == ["everyone", "Танкисты", "Логисты"]
            roles = (await c.get("/api/v1/clan/mentions", headers=tank1)).json()
            assert [r["name"] for r in roles] == ["Танкисты", "Логисты"]

            op = (await c.post("/api/v1/clan/operations", headers=boss,
                               json={"title": "Прорыв", "date": "2026-11-02", "note": "@танкисты сбор в 19:00"})).json()

            # танкисты получили письмо (автор себе — нет), логист — нет
            mail = (await c.get("/api/v1/mail", headers=tank1)).json()
            assert mail["unread"] == 1
            [m] = mail["items"]
            assert m["kind"] == "operation_mention" and m["sender_name"] == "Boss"
            assert m["payload"]["operation_id"] == op["id"] and m["payload"]["roles"] == ["Танкисты"]
            assert (await c.get("/api/v1/mail", headers=log1)).json()["items"] == []
            assert (await c.get("/api/v1/mail", headers=boss)).json()["items"] == []

            # правка: письма только новым ролям
            await c.put(f"/api/v1/clan/operations/{op['id']}", headers=boss,
                        json={"title": "Прорыв", "date": "2026-11-02", "note": "@Танкисты и @Логисты"})
            assert (await c.get("/api/v1/mail", headers=tank1)).json()["unread"] == 1
            assert (await c.get("/api/v1/mail", headers=log1)).json()["unread"] == 1

            # прочитать / удалить можно только своё
            assert (await c.post(f"/api/v1/mail/{m['id']}/read", headers=log1)).status_code == 404
            assert (await c.post(f"/api/v1/mail/{m['id']}/read", headers=tank1)).status_code == 204
            assert (await c.get("/api/v1/mail", headers=tank1)).json()["unread"] == 0
            assert (await c.delete(f"/api/v1/mail/{m['id']}", headers=tank1)).status_code == 204
            assert (await c.get("/api/v1/mail", headers=tank1)).json()["items"] == []

            # @everyone — весь клан, кроме автора
            await c.post("/api/v1/clan/operations", headers=boss, json={"title": "Сбор", "date": "2026-11-03", "note": "@everyone"})
            assert (await c.get("/api/v1/mail", headers=log1)).json()["unread"] == 2
            assert (await c.post("/api/v1/mail/read", headers=log1)).status_code == 204
            assert (await c.get("/api/v1/mail", headers=log1)).json()["unread"] == 0

    run(main())


def test_feedback_reply_reaches_author_mail(db, monkeypatch):
    async def main() -> None:
        from app.core.config import settings
        monkeypatch.setattr(settings, "FEEDBACK_ADMIN_IDS", "dev")
        await seed()
        author = auth("tank1", ClanRole.MEMBER, "Tank One")
        dev = auth("dev", ClanRole.OWNER, "Reppot")
        async with client() as c:
            fb = (await c.post("/api/v1/feedback", headers=author, json={"category": "idea", "message": "Добавьте почту"})).json()
            # отвечать может только владелец сайта
            assert (await c.post(f"/api/v1/feedback/{fb['id']}/reply", headers=author, json={"text": "сам себе"})).status_code == 403
            r = await c.post(f"/api/v1/feedback/{fb['id']}/reply", headers=dev, json={"text": "  Готово, смотрите раздел «Почта»  "})
            assert r.status_code == 200 and r.json()["reply"] == "Готово, смотрите раздел «Почта»" and r.json()["status"] == "done"
            mail = (await c.get("/api/v1/mail", headers=author)).json()
            [m] = mail["items"]
            assert m["kind"] == "feedback_reply" and m["sender_name"] == "Reppot" and m["payload"]["message"] == "Добавьте почту"
            mine = (await c.get("/api/v1/feedback", headers=author)).json()["mine"]
            assert mine[0]["reply"].startswith("Готово")

    run(main())
