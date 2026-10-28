"""Очки снабжения: доставка с потолком строки и множителями, закрытие строк, резервы (30 за
«спасение»), явка, выполненный свой заказ; лиги и ступени; рейтинг, значки, профиль."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from httpx import ASGITransport, AsyncClient

from app.api.v1 import game as game_api
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.main import app
from app.services import gamification as game
from tests.conftest import run, seed_clan

API = "/api/v1"


def auth(user_id: str, role: ClanRole = ClanRole.OFFICER) -> dict[str, str]:
    return {"Authorization": f"Bearer {issue_access_token(user_id=user_id, clan_id='CLAN_A', role=role, display_name=user_id.title())}"}


def test_league_divisions():
    assert game.league(0) == {"tier": "iron", "division": 4, "points": 0, "floor": 0, "next_at": 25}
    assert game.league(75)["division"] == 1 and game.league(75)["next_at"] == 100
    assert (game.league(1140)["tier"], game.league(1140)["division"]) == ("gold", 2)
    assert game.league(25000) == {"tier": "master", "division": None, "points": 25000, "floor": 10000, "next_at": None}


def test_points_board_badges_profile(db, monkeypatch):
    async def fake_war() -> dict:
        return {"warNumber": 142, "conquestStartTime": (datetime.now(UTC) - timedelta(days=10)).timestamp() * 1000}

    monkeypatch.setattr(game_api, "current_war", fake_war)
    game.forget("CLAN_A")

    async def main() -> None:
        await seed_clan("CLAN_A")
        alice, bob = auth("alice"), auth("bob")
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            report = (await c.post(f"{API}/reports", headers=alice, json={"title": "Фронт", "lines": [
                {"name": "Rifle", "quantity": 10, "unit": "crate"}, {"name": "Tank", "quantity": 2, "unit": "unit"},
            ]})).json()["report"]
            rid, rifle, tank = report["id"], report["lines"][0]["id"], report["lines"][1]["id"]
            await c.patch(f"{API}/reports/{rid}/task", headers=alice, json={"priority": "high", "due_date": tomorrow})
            # 6 ящиков: ×1,25 в срок × 1,2 высокий = 9
            await c.post(f"{API}/reports/{rid}/progress", headers=bob, json={"lines": [{"line_id": rifle, "quantity": 6}]})
            # ещё 6 — засчитывается 4 (потолок строки) + 2 танка ×5: (4+10)×1,5 = 21, обе строки закрыты: +10
            await c.post(f"{API}/reports/{rid}/progress", headers=bob, json={"lines": [{"line_id": rifle, "quantity": 6}, {"line_id": tank, "quantity": 2}]})
            await c.post(f"{API}/reports/{rid}/status", headers=alice, json={"status": "done"})        # alice +2

            # резерв: осталось меньше 2 ч — «спасение» = 30
            timer = (await c.post(f"{API}/timers", headers=bob, json={"title": "Sind-1", "ends_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat()})).json()
            timer = timer.get("timer", timer)
            assert (await c.patch(f"{API}/timers/{timer['id']}", headers=bob, json={"restart": True})).status_code == 200

            # явка на прошедшую операцию = 5
            op = (await c.post(f"{API}/clan/operations", headers=alice, json={"title": "Вчера", "date": (date.today() - timedelta(days=1)).isoformat()})).json()
            await c.post(f"{API}/clan/operations/{op['id']}/attend", headers=bob, json={"going": True})

            game.forget("CLAN_A")
            board = (await c.get(f"{API}/clan/game", headers=bob, params={"period": "week"})).json()
            assert board["season"]["war"] == 142
            assert [(r["user_id"], r["value"]) for r in board["rows"]] == [("bob", 75.0), ("alice", 2.0)]
            assert board["me"]["rank"] == 1 and board["rows"][0]["league"]["tier"] == "iron" and board["rows"][0]["league"]["division"] == 1
            crates = (await c.get(f"{API}/clan/game", headers=bob, params={"category": "crates"})).json()
            assert [(r["user_id"], r["value"]) for r in crates["rows"]] == [("bob", 10.0)]
            reserves = (await c.get(f"{API}/clan/game", headers=bob, params={"category": "reserves"})).json()
            assert reserves["rows"][0]["value"] == 1

            badges = (await c.get(f"{API}/clan/game/badges", headers=alice)).json()
            assert badges["bob"] == {"tier": "iron", "division": 1, "title": None}

            prof = (await c.get(f"{API}/clan/game/members/bob", headers=alice)).json()
            assert prof["breakdown"] == {"delivery": 30.0, "line_done": 10.0, "reserve": 30.0, "attend": 5.0, "order_done": 0.0}
            assert (prof["crates"], prof["units"], prof["due_ok"], prof["due_total"], prof["season_rank"]) == (10, 2, 2, 2, 1)
            assert len(prof["weeks"]) == 12 and prof["weeks"][-1]["points"] == 75.0
            assert prof["recent"][0]["kind"] in {"attend", "reserve"}
            assert (await c.get(f"{API}/clan/game/members/nobody", headers=alice)).status_code == 404


    run(main())
