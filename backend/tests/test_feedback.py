"""Обратная связь о сайте: пишут вошедшие участники, читает владелец сайта (FEEDBACK_ADMIN_IDS)."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.main import app
from tests.conftest import run, seed_clan

API = "/api/v1"


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def user(user_id: str, name: str, clan: str = "CLAN_A") -> dict[str, str]:
    token = issue_access_token(user_id=user_id, clan_id=clan, role=ClanRole.MEMBER, display_name=name)
    return {"Authorization": f"Bearer {token}"}


def test_feedback_write_read_and_admin_inbox(db, monkeypatch):
    monkeypatch.setattr(settings, "FEEDBACK_ADMIN_IDS", "owner-1, other-admin")

    async def main() -> None:
        await seed_clan("CLAN_A", name="Alpha")
        await seed_clan("CLAN_B", name="Bravo")
        bob = user("bob", "Bob#Warden")
        owner = user("owner-1", "Reppot", clan="CLAN_B")
        async with client() as c:
            r = await c.post(f"{API}/feedback", json={"category": "bug", "message": "  Пирамида не грузится  ", "page": "tools/pyramid"}, headers=bob)
            assert r.status_code == 201, r.text
            sent = r.json()
            assert sent["message"] == "Пирамида не грузится" and sent["user_name"] == "Bob#Warden" and sent["clan_name"] == "Alpha"

            mine = (await c.get(f"{API}/feedback", headers=bob)).json()
            assert mine["is_admin"] is False and mine["can_write"] is True
            assert [m["id"] for m in mine["mine"]] == [sent["id"]] and mine["inbox"] == []

            # владелец сайта видит всё: ник, клан, страницу
            inbox = (await c.get(f"{API}/feedback", headers=owner)).json()
            assert inbox["is_admin"] is True and inbox["unread"] == 1
            [item] = inbox["inbox"]
            assert (item["user_name"], item["clan_name"], item["page"], item["category"]) == ("Bob#Warden", "Alpha", "tools/pyramid", "bug")

            # статус и удаление — только владелец сайта
            assert (await c.patch(f"{API}/feedback/{sent['id']}", json={"status": "read"}, headers=bob)).status_code == 403
            done = await c.patch(f"{API}/feedback/{sent['id']}", json={"status": "done"}, headers=owner)
            assert done.status_code == 200 and done.json()["status"] == "done"
            assert (await c.get(f"{API}/feedback", headers=owner)).json()["unread"] == 0
            assert (await c.delete(f"{API}/feedback/{sent['id']}", headers=bob)).status_code == 403
            assert (await c.delete(f"{API}/feedback/{sent['id']}", headers=owner)).status_code == 204

            # слишком короткое — 422; не больше 5 в час
            assert (await c.post(f"{API}/feedback", json={"message": " a "}, headers=bob)).status_code == 422
            for n in range(5):
                assert (await c.post(f"{API}/feedback", json={"message": f"идея {n}"}, headers=bob)).status_code == 201
            limited = await c.post(f"{API}/feedback", json={"message": "ещё одна"}, headers=bob)
            assert limited.status_code == 429 and "5" in limited.json()["error"]["message"]

    run(main())


def test_guest_cannot_write_feedback(db):
    async def main() -> None:
        async with client() as c:
            guest = await c.post(f"{API}/auth/guest")
            assert guest.status_code == 200, guest.text
            view = (await c.get(f"{API}/feedback")).json()
            assert view["can_write"] is False and view["is_admin"] is False
            assert (await c.post(f"{API}/feedback", json={"message": "привет"})).status_code == 403

    run(main())
