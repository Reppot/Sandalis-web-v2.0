"""Удаление заказа вместо отмены: автор — свой, с правом reports:delete — любой; из БД
вместе с лентой и вкладами; отменить статусом нельзя."""
from __future__ import annotations

import uuid

from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.core.db import AsyncSessionLocal
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.core.tenancy import bypass_clan_filter
from app.main import app
from app.models.report import OrderReport, ReportContribution
from app.models.report_event import ReportEvent
from tests.conftest import run, seed_clan

API = "/api/v1"


def auth(user_id: str, role: ClanRole) -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_access_token(user_id=user_id, clan_id='CLAN_A', role=role, display_name=user_id)}"}


async def count(model, rid: str) -> int:  # noqa: ANN001
    col = model.id if model is OrderReport else model.report_id
    async with AsyncSessionLocal() as s:
        with bypass_clan_filter():
            return (await s.execute(select(func.count()).where(col == uuid.UUID(rid)))).scalar_one()


def test_delete_instead_of_cancel(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        alice, bob, officer = auth("alice", ClanRole.MEMBER), auth("bob", ClanRole.MEMBER), auth("off", ClanRole.OFFICER)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            report = (await c.post(f"{API}/reports", headers=alice, json={"title": "Лишний", "lines": [{"name": "Rifle", "quantity": 5}]})).json()["report"]
            rid, line = report["id"], report["lines"][0]["id"]
            await c.post(f"{API}/reports/{rid}/progress", headers=bob, json={"lines": [{"line_id": line, "quantity": 2}]})
            op = (await c.post(f"{API}/clan/operations", headers=officer, json={"title": "Удар", "date": "2026-12-01"})).json()
            await c.patch(f"{API}/reports/{rid}/task", headers=officer, json={"operation_id": op["id"]})

            assert (await c.post(f"{API}/reports/{rid}/status", headers=alice, json={"status": "cancelled"})).status_code == 409
            assert (await c.delete(f"{API}/reports/{rid}", headers=bob)).status_code == 403
            assert await count(ReportEvent, rid) > 0 and await count(ReportContribution, rid) == 1

            # автор удаляет свой — из БД вместе с лентой и вкладами
            assert (await c.delete(f"{API}/reports/{rid}", headers=alice)).status_code == 204
            assert (await c.get(f"{API}/reports/{rid}", headers=alice)).status_code == 404
            assert [await count(m, rid) for m in (OrderReport, ReportEvent, ReportContribution)] == [0, 0, 0]

            # с правом reports:delete — чужой тоже
            other = (await c.post(f"{API}/reports", headers=bob, json={"lines": [{"name": "Bandage", "quantity": 1}]})).json()["report"]
            assert (await c.delete(f"{API}/reports/{other['id']}", headers=officer)).status_code == 204

    run(main())
