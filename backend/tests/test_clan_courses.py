"""Курсы клана: участник читает, командир/высокий доступ пишет; чужой клан и гость курсов не видят."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.permissions import ClanRole
from app.main import app
from tests.conftest import bearer, run, seed_clan

API = "/api/v1/clan/courses"


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def test_clan_courses_crud_and_isolation(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        await seed_clan("CLAN_B")
        boss = bearer(user_id="boss", clan_id="CLAN_A", role=ClanRole.OWNER)
        admin = bearer(user_id="adm", clan_id="CLAN_A", role=ClanRole.ADMIN)
        member = bearer(user_id="mem", clan_id="CLAN_A", role=ClanRole.MEMBER)
        stranger = bearer(user_id="eve", clan_id="CLAN_B", role=ClanRole.OWNER)
        async with client() as c:
            # участник читает пустой список и не может писать
            r = await c.get(API, headers=member)
            assert r.status_code == 200 and r.json() == {"can_edit": False, "max_courses": 50, "courses": []}
            assert (await c.post(API, headers=member, json={"title": "X"})).status_code == 403

            a = (await c.post(API, headers=boss, json={"title": "  Логистика  ", "summary": "Склады", "body": "## Тема\n- пункт"})).json()
            assert a["title"] == "Логистика" and a["sort"] == 1
            b = (await c.post(API, headers=admin, json={"title": "Танки"})).json()
            assert b["sort"] == 2

            listed = (await c.get(API, headers=member)).json()
            assert [x["title"] for x in listed["courses"]] == ["Логистика", "Танки"]
            assert (await c.get(API, headers=boss)).json()["can_edit"] is True

            # правка и порядок
            r = await c.put(f"{API}/{a['id']}", headers=admin, json={"title": "Логистика 2", "body": "текст"})
            assert r.status_code == 200 and r.json()["body"] == "текст"
            r = await c.put(API, headers=boss, json={"ids": [b["id"], a["id"]]})
            assert [x["title"] for x in r.json()["courses"]] == ["Танки", "Логистика 2"]

            # чужой клан не видит и не может изменить курс
            assert (await c.get(API, headers=stranger)).json()["courses"] == []
            assert (await c.put(f"{API}/{a['id']}", headers=stranger, json={"title": "взлом"})).status_code == 404
            assert (await c.delete(f"{API}/{a['id']}", headers=stranger)).status_code == 404

            assert (await c.delete(f"{API}/{a['id']}", headers=boss)).status_code == 204
            assert [x["title"] for x in (await c.get(API, headers=member)).json()["courses"]] == ["Танки"]

            # пустое название не принимается
            assert (await c.post(API, headers=boss, json={"title": "   "})).status_code == 422

    run(main())
