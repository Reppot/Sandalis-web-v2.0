"""Заказ как задача: исполнители, приоритет, срок, теги, операция, «взять себе», прогресс в списке."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.db import AsyncSessionLocal
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.core.tenancy import clan_scope
from app.main import app
from app.models.rbac import ClanMembership, User
from tests.conftest import run, seed_clan

API = "/api/v1"


def auth(user_id: str, role: ClanRole, name: str, clan: str = "CLAN_A") -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_access_token(user_id=user_id, clan_id=clan, role=role, display_name=name)}"}


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def seed() -> None:
    await seed_clan("CLAN_A")
    await seed_clan("CLAN_B")
    async with AsyncSessionLocal() as s:
        for uid, name in [("boss", "Boss"), ("tank", "Tank"), ("rookie", "Rookie")]:
            s.add(User(id=uid, display_name=name))
        await s.flush()
        with clan_scope("CLAN_A"):
            s.add(ClanMembership(user_id="boss", role=ClanRole.OFFICER))
            s.add(ClanMembership(user_id="tank", role=ClanRole.MEMBER))
            s.add(ClanMembership(user_id="rookie", role=ClanRole.GUEST))
            await s.commit()


def test_report_task_fields_take_and_progress(db):
    async def main() -> None:
        await seed()
        boss, tank, rookie = auth("boss", ClanRole.OFFICER, "Boss"), auth("tank", ClanRole.MEMBER, "Tank"), auth("rookie", ClanRole.GUEST, "Rookie")
        async with client() as c:
            created = (await c.post(f"{API}/reports", headers=boss, json={"title": "Фронт", "lines": [
                {"name": "Rifle", "quantity": 10, "unit": "crate"}, {"name": "7.62mm", "quantity": 5, "unit": "crate"},
            ]})).json()["report"]
            rid = created["id"]
            assert (created["priority"], created["assignees"], created["tags"], created["delivered_total"]) == ("normal", [], [], 0)

            names = [m["name"] for m in (await c.get(f"{API}/reports/assignees", headers=tank)).json()]
            assert names == ["Boss", "Rookie", "Tank"]

            op = (await c.post(f"{API}/clan/operations", headers=boss, json={"title": "Удар", "date": "2026-11-02"})).json()
            r = await c.patch(f"{API}/reports/{rid}/task", headers=boss, json={
                "priority": "high", "due_date": "2026-11-01", "tags": ["#Фронт", "фронт", " Арта "],
                "assignees": ["tank", "stranger", "tank"], "operation_id": op["id"],
            })
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["priority"] == "high" and body["due_date"] == "2026-11-01" and body["tags"] == ["фронт", "арта"]
            assert body["assignees"] == [{"user_id": "tank", "name": "Tank"}] and body["operation_id"] == op["id"]

            # назначенному — письмо в почту сайта
            mail = (await c.get(f"{API}/mail", headers=tank)).json()
            assert mail["unread"] == 1 and mail["items"][0]["kind"] == "task_assigned" and mail["items"][0]["payload"]["title"] == "Фронт"

            # очистить срок, не трогая остальное
            r = await c.patch(f"{API}/reports/{rid}/task", headers=boss, json={"due_date": None})
            assert r.json()["due_date"] is None and r.json()["priority"] == "high"

            # без reports:status поля задачи менять нельзя, а взять заказ себе — можно
            assert (await c.patch(f"{API}/reports/{rid}/task", headers=rookie, json={"priority": "low"})).status_code == 403
            r = await c.post(f"{API}/reports/{rid}/take", headers=rookie, json={"take": True})
            assert [a["user_id"] for a in r.json()["assignees"]] == ["tank", "rookie"]
            r = await c.post(f"{API}/reports/{rid}/take", headers=rookie, json={"take": False})
            assert [a["user_id"] for a in r.json()["assignees"]] == ["tank"]

            # прогресс и вкладчики приходят прямо в списке
            line = created["lines"][0]["id"]
            await c.post(f"{API}/reports/{rid}/progress", headers=tank, json={"stockpile_label": "BB", "lines": [{"line_id": line, "quantity": 12}]})
            [row] = (await c.get(f"{API}/reports", headers=boss)).json()["items"]
            assert row["delivered_total"] == 10 and row["contributor_ids"] == ["tank"]

            # операции чужого клана не видно — привязать нельзя
            other = (await c.post(f"{API}/clan/operations", headers=auth("eve", ClanRole.OWNER, "Eve", "CLAN_B"), json={"title": "X", "date": "2026-11-02"})).json()
            assert (await c.patch(f"{API}/reports/{rid}/task", headers=boss, json={"operation_id": other["id"]})).status_code == 404

            # удаление операции снимает привязку
            assert (await c.delete(f"{API}/clan/operations/{op['id']}", headers=boss)).status_code == 204
            assert (await c.get(f"{API}/reports/{rid}", headers=boss)).json()["operation_id"] is None

    run(main())


def test_report_feed_comments_reminders_and_delivered_mail(db):
    async def main() -> None:
        from datetime import date

        await seed()
        boss, tank = auth("boss", ClanRole.OFFICER, "Boss"), auth("tank", ClanRole.MEMBER, "Tank")
        async with client() as c:
            created = (await c.post(f"{API}/reports", headers=boss, json={"title": "Склад", "lines": [{"name": "Rifle", "quantity": 4, "unit": "crate"}]})).json()["report"]
            rid, line = created["id"], created["lines"][0]["id"]
            op = (await c.post(f"{API}/clan/operations", headers=boss, json={"title": "Штурм", "date": "2026-12-01"})).json()
            await c.patch(f"{API}/reports/{rid}/task", headers=boss, json={"priority": "high", "assignees": ["tank"], "operation_id": op["id"], "due_date": date.today().isoformat()})

            # лента: события в обратном порядке, от имени того, кто действовал
            kinds = [e["kind"] for e in (await c.get(f"{API}/reports/{rid}/events", headers=tank)).json()]
            assert kinds[-1] == "created" and {"priority", "assigned", "operation", "due"} <= set(kinds)

            # комментарий с @участником → письмо упомянутому, автору — нет
            r = await c.post(f"{API}/reports/{rid}/comments", headers=boss, json={"text": "  @Tank вези к фронту  "})
            assert r.status_code == 201 and r.json()["kind"] == "comment" and r.json()["payload"]["text"] == "@Tank вези к фронту"
            assert r.json()["actor_name"] == "Boss"
            mail = (await c.get(f"{API}/mail", headers=tank)).json()["items"]
            assert [m["kind"] for m in mail].count("order_comment") == 1
            assert (await c.post(f"{API}/reports/{rid}/comments", headers=boss, json={"text": "   "})).status_code == 422

            # напоминание о сроке — один раз при открытии списка
            await c.get(f"{API}/reports", headers=tank)
            await c.get(f"{API}/reports", headers=boss)
            mail = (await c.get(f"{API}/mail", headers=tank)).json()["items"]
            assert [m["kind"] for m in mail].count("task_due") == 1

            # доставлено полностью → письмо автору заказа и запись в ленте (тоже один раз)
            await c.post(f"{API}/reports/{rid}/progress", headers=tank, json={"stockpile_label": "BB", "lines": [{"line_id": line, "quantity": 3}]})
            assert (await c.get(f"{API}/mail", headers=boss)).json()["items"] == []
            await c.post(f"{API}/reports/{rid}/progress", headers=tank, json={"stockpile_label": "BB", "lines": [{"line_id": line, "quantity": 2}]})
            await c.post(f"{API}/reports/{rid}/progress", headers=tank, json={"stockpile_label": "BB", "lines": [{"line_id": line, "quantity": 1}]})
            [m] = (await c.get(f"{API}/mail", headers=boss)).json()["items"]
            assert m["kind"] == "order_delivered" and m["payload"]["operation"] == "Штурм" and m["sender_name"] == "Tank"
            feed = (await c.get(f"{API}/reports/{rid}/events", headers=boss)).json()
            assert [e["kind"] for e in feed].count("delivered") == 1 and [e["kind"] for e in feed].count("contribution") == 3

            # чужой клан не видит ленту
            eve = auth("eve", ClanRole.OWNER, "Eve", "CLAN_B")
            assert (await c.get(f"{API}/reports/{rid}/events", headers=eve)).status_code == 404

    run(main())
