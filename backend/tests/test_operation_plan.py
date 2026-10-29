"""Детальный план операции: роли со слотами, ответы «иду / возможно / не иду», назначение
отряда и явки, этап отмечает ответственный, брифинг без скрытых этапов и разделов."""
from __future__ import annotations

import json
from datetime import date, timedelta

import respx
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.main import app
from tests.conftest import run, seed_clan

API = "/api/v1/clan/operations"
BOT = "https://discord.com/api/v10"
WEBHOOK = "https://discord.com/api/webhooks/123/secret-token-abcd"


def auth(uid: str, role: ClanRole = ClanRole.MEMBER) -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_access_token(user_id=uid, clan_id='CLAN_A', role=role, display_name=uid.title())}"}


def test_plan_roles_answers_brief(db, monkeypatch):
    monkeypatch.setattr(settings, "DISCORD_BOT_TOKEN", "bot")
    boss, ann, bob = auth("boss", ClanRole.OWNER), auth("ann"), auth("bob")

    async def main() -> None:
        await seed_clan("CLAN_A")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            day = (date.today() + timedelta(days=2)).isoformat()
            # точки ставятся в «Планировании» и приходят в операцию со снимком
            snap = {"name": "Мост", "rect": {"x": 0, "y": 0, "w": 100, "h": 100}, "regions": [], "shapes": [
                {"id": "p1", "kind": "point", "point": "rally", "label": "Бункер у моста", "note": "", "x": 1, "y": 1, "angle": 0, "size": 100},
                {"id": "p2", "kind": "point", "point": "retreat", "label": "Северный КПП", "note": "", "x": 2, "y": 2, "angle": 0, "size": 100},
                {"id": "l1", "kind": "line", "x": 0, "y": 0, "angle": 0, "length": 10, "width": 2, "color": "#fff"},
            ]}
            op = (await c.post(API, headers=boss, json={"title": "Штурм", "date": day, "note": "секрет", "snapshots": [snap]})).json()
            assert [(p["id"], p["kind"], p["snapshot"]) for p in op["plan"]["points"]] == [("p1", "rally", 0), ("p2", "retreat", 0)]
            assert op["plan"]["stages"] == [] and op["plan"]["debrief"] == {"outcome": None, "text": ""}
            plan = {
                "roles": [{"id": "tank", "name": "Танк", "slots": 1}, {"id": "inf", "name": "Пехота", "slots": 0}],
                "squads": [{"id": "a", "name": "Отряд A", "leader_id": "ann"}],
                "stages": [{"id": "s1", "time": "17:30", "title": "Сбор", "owner_id": "ann"},
                           {"id": "s2", "time": "18:00", "title": "Обход с фланга", "brief": False}],
                # командир правит только «в брифинге»; подпись и тип берутся со снимка
                "points": [{"id": "p1", "kind": "other", "label": "подмена"}, {"id": "p2", "label": "", "brief": False},
                           {"id": "zz", "label": "лишняя"}],
                "hidden": ["note"],
            }
            r = await c.put(f"{API}/{op['id']}/plan", headers=ann, json=plan)
            assert r.status_code == 403
            assert (await c.put(f"{API}/{op['id']}/plan", headers=boss, json={**plan, "stages": [{"id": "s1", "time": "25:00", "title": "x"}]})).status_code == 422
            saved = (await c.put(f"{API}/{op['id']}/plan", headers=boss, json=plan)).json()["plan"]
            assert saved["stages"][1]["brief"] is False
            assert [(p["id"], p["kind"], p["label"], p["brief"]) for p in saved["points"]] == [
                ("p1", "rally", "Бункер у моста", True), ("p2", "retreat", "Северный КПП", False)]

            # слот танка один: Ann занимает, Bob получает ошибку; «возможно» без проверки слота
            assert (await c.post(f"{API}/{op['id']}/attend", headers=ann, json={"status": "go", "role": "tank"})).status_code == 200
            r = await c.post(f"{API}/{op['id']}/attend", headers=bob | {"X-Locale": "ru"}, json={"status": "go", "role": "tank"})
            assert r.status_code == 422 and "Танк" in r.json()["error"]["message"]
            assert (await c.post(f"{API}/{op['id']}/attend", headers=bob, json={"status": "maybe"})).status_code == 200
            assert (await c.post(f"{API}/{op['id']}/attend", headers=auth("cid"), json={"going": True})).status_code == 200  # старая форма
            assert (await c.post(f"{API}/{op['id']}/attend", headers=auth("dan"), json={"status": "no"})).status_code == 200

            # командир: отряд и явка; этап отмечает ответственный, чужой — нет
            r = await c.post(f"{API}/{op['id']}/assign", headers=boss, json={"user_id": "ann", "squad": "a", "attended": True})
            people = {p["user_id"]: p for p in r.json()["participants"]}
            assert people["ann"] | {"at": ""} == {"user_id": "ann", "name": "Ann", "at": "", "status": "go", "role": "tank", "squad": "a", "attended": True}
            assert people["bob"]["status"] == "maybe" and people["cid"]["status"] == "go" and people["dan"]["status"] == "no"
            assert (await c.post(f"{API}/{op['id']}/assign", headers=boss, json={"user_id": "ann", "squad": "zzz"})).status_code == 422
            assert (await c.post(f"{API}/{op['id']}/stages/s1", headers=bob, json={"done": True})).status_code == 403
            assert (await c.post(f"{API}/{op['id']}/stages/s1", headers=ann, json={"done": True})).json()["plan"]["stages"][0]["done"]

            # убрали роль из плана — она снимается с участника
            r = await c.put(f"{API}/{op['id']}/plan", headers=boss, json={**plan, "roles": plan["roles"][1:]})
            assert {p["user_id"]: p for p in r.json()["participants"]}["ann"]["role"] is None
            await c.put(f"{API}/{op['id']}/plan", headers=boss, json=plan)
            await c.post(f"{API}/{op['id']}/attend", headers=ann, json={"status": "go", "role": "tank"})

            r = await c.put(f"{API}/{op['id']}/debrief", headers=boss, json={"outcome": "success", "text": "Взяли город"})
            assert r.json()["plan"]["debrief"]["outcome"] == "success"
            full = (await c.get(f"{API}/{op['id']}", headers=boss)).json()
            assert full["supply"] == [] and isinstance(full["silent"], list)

            # брифинг в ветку: без скрытой заметки и скрытого этапа
            assert (await c.put("/api/v1/clan/settings", headers=boss | {"X-Locale": "ru"}, json={"discord_webhook_url": WEBHOOK})).status_code == 200
            with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
                mock.get(WEBHOOK).respond(200, json={"channel_id": "C1"})
                sent = mock.post(f"{BOT}/channels/C1/messages").respond(200, json={"id": "M2"})
                assert (await c.post(f"{API}/{op['id']}/brief", headers=ann)).status_code == 403
                r = await c.post(f"{API}/{op['id']}/brief", headers=boss, files=[("images", ("map-1.png", b"\x89PNG-fake", "image/png"))])
                assert r.json() == {"posted": True}
            *texts, pics = sent.calls
            text = "".join(json.loads(call.request.content)["content"] for call in texts)
            assert b'filename="map-1.png"' in pics.request.content and b"\x89PNG-fake" in pics.request.content
            assert "Сбор" in text and "Ann" in text and "Бункер у моста" in text and "Взяли город" in text
            assert "Обход с фланга" not in text and "секрет" not in text and "Северный КПП" not in text
            assert "Танк** (1/1): Ann" in text and "Отряд A** (старший: Ann): Ann" in text

    run(main())
