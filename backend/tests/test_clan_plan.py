"""Общий план клана: правки операциями не затирают чужие объекты, since отдаёт «без изменений»,
править может только тот, кто создаёт операции. Напоминание не ответившим — за сутки, один раз."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update

from app.core.db import AsyncSessionLocal
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.core.tenancy import bypass_clan_filter, clan_scope
from app.main import app
from app.models.mail import ClanMail
from app.models.operation import ClanOperation
from app.models.rbac import ClanMembership, User
from app.services import discord_ops
from tests.conftest import run, seed_clan

API = "/api/v1/clan/plan"


def auth(uid: str, role: ClanRole) -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_access_token(user_id=uid, clan_id='CLAN_A', role=role, display_name=uid.title())}"}


def shape(sid: str, x: float = 1, **kw) -> dict:
    return {"id": sid, "kind": "point", "x": x, "y": 2, "angle": 0, "point": "target", "label": sid, "note": "", "size": 100, **kw}


def test_shared_plan_ops(db):
    boss, ann, guest = auth("boss", ClanRole.OWNER), auth("ann", ClanRole.OFFICER), auth("bob", ClanRole.GUEST)

    async def main() -> None:
        await seed_clan("CLAN_A")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            st = (await c.get(API, headers=boss)).json()
            assert st["version"] == 0 and st["shapes"] == [] and st["can_edit"] is True
            assert (await c.get(API, headers=boss, params={"since": 0})).json()["shapes"] is None

            v1 = (await c.post(f"{API}/ops", headers=boss, json={"upsert": [shape("a"), shape("b")]})).json()
            assert v1["version"] == 1 and [s["id"] for s in v1["shapes"]] == ["a", "b"] and v1["updated_by_name"] == "Boss"
            # два офицера правят разные объекты почти одновременно — обе правки на месте
            await c.post(f"{API}/ops", headers=ann, json={"upsert": [shape("a", x=50)]})
            v3 = (await c.post(f"{API}/ops", headers=boss, json={"upsert": [shape("c")], "delete": ["b"]})).json()
            assert [(s["id"], s["x"]) for s in v3["shapes"]] == [("a", 50), ("c", 1)] and v3["version"] == 3
            assert (await c.get(API, headers=ann, params={"since": 3})).json()["shapes"] is None
            assert len((await c.get(API, headers=ann, params={"since": 1})).json()["shapes"]) == 2

            assert (await c.get(API, headers=guest)).json()["can_edit"] is False
            assert (await c.post(f"{API}/ops", headers=guest, json={"upsert": [shape("z")]})).status_code == 403
            assert (await c.post(f"{API}/ops", headers=boss, json={"upsert": [{"id": "q", "kind": "bomb", "x": 1, "y": 1}]})).status_code == 422
            assert (await c.post(f"{API}/ops", headers=boss, json={"clear": True})).json()["shapes"] == []

    run(main())


def test_rsvp_reminder_once(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        now = datetime.now(UTC)
        async with AsyncSessionLocal() as s:
            for uid in ("ann", "bob", "cid"):
                s.add(User(id=uid, display_name=uid.title()))
            await s.flush()
            with clan_scope("CLAN_A"):
                for uid in ("ann", "bob", "cid"):
                    s.add(ClanMembership(user_id=uid, role=ClanRole.MEMBER))
                s.add(ClanOperation(title="Рейд", date=(now + timedelta(hours=20)).date(), note="", snapshots=[], report_ids=[],
                                    participants=[{"user_id": "ann", "name": "Ann", "at": now.isoformat(), "status": "go"}],
                                    author_id="boss", author_name="Boss", starts_at=now + timedelta(hours=20), plan={}))
                s.add(ClanOperation(title="Далеко", date=(now + timedelta(days=5)).date(), note="", snapshots=[], report_ids=[],
                                    participants=[], author_id="boss", author_name="Boss", starts_at=now + timedelta(days=5), plan={}))
                await s.commit()
        # только что созданная — ждём час
        assert await discord_ops.ask_silent(now) == 0
        async with AsyncSessionLocal() as s:
            with bypass_clan_filter():
                await s.execute(update(ClanOperation).values(created_at=now - timedelta(hours=3)))
                await s.commit()
        assert await discord_ops.ask_silent(now) == 2          # bob и cid; ann уже ответила
        assert await discord_ops.ask_silent(now) == 0          # второй раз — нет
        async with AsyncSessionLocal() as s:
            with bypass_clan_filter():
                mails = (await s.execute(select(ClanMail).where(ClanMail.kind == "operation_rsvp"))).scalars().all()
        assert sorted(m.recipient_id for m in mails) == ["bob", "cid"] and mails[0].payload["title"] == "Рейд"

    run(main())
