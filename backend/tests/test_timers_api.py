"""E2E: таймеры — legacy/современный ввод, фильтры, RBAC, изоляция, локали."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from httpx import ASGITransport, AsyncClient

from app.core.permissions import ClanRole
from app.main import app
from tests.conftest import bearer, run, seed_clan

API = "/api/v1"


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")


def test_timers_flow(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        await seed_clan("CLAN_B", "Bravo")
        officer = bearer(clan_id="CLAN_A", role=ClanRole.OFFICER)
        admin_b = bearer(clan_id="CLAN_B")
        ru = {**officer, "Accept-Language": "ru"}
        now = datetime.now(UTC)

        async with client() as c:
            # --- современный ввод: aware ends_at ------------------------------
            t1 = await c.post(
                f"{API}/timers",
                json={"title": "Decay", "ends_at": (now + timedelta(hours=10)).isoformat()},
                headers=ru,
            )
            assert t1.status_code == 201, t1.text
            b1 = t1.json()
            assert b1["message"] == "Таймер «Decay» запущен."
            timer = b1["timer"]
            tid = timer["id"]
            assert timer["type"] == "stockpile_decay"       # legacy-алиас
            assert timer["target_timestamp"] > 0            # legacy-поле (мс)
            assert timer["expired"] is False
            assert timer["urgency"] == "warning"            # < 12 ч
            assert 35_000 < timer["remaining_seconds"] <= 36_000
            assert timer["remaining_display"].startswith("09:")
            assert "clan_id" not in timer

            # --- legacy-ввод: target_timestamp (мс) + duration_seconds --------
            target_ms = int((now + timedelta(hours=2)).timestamp() * 1000)
            t2 = await c.post(
                f"{API}/timers",
                json={"title": "Op", "kind": "operation",
                      "target_timestamp": target_ms, "duration_seconds": 7200},
                headers=officer,
            )
            assert t2.status_code == 201, t2.text
            t2j = t2.json()["timer"]
            assert t2j["kind"] == "operation"
            assert t2j["duration_seconds"] == 7200
            assert t2j["urgency"] == "critical"             # < 4 ч

            # --- валидация ввода ----------------------------------------------
            naive = await c.post(f"{API}/timers",
                                 json={"title": "x", "ends_at": "2030-01-01T00:00:00"},
                                 headers=officer)
            assert naive.status_code == 422          # таймзона обязательна

            both = await c.post(f"{API}/timers",
                                json={"title": "x",
                                      "ends_at": (now + timedelta(hours=1)).isoformat(),
                                      "target_timestamp": target_ms},
                                headers=officer)
            assert both.status_code == 422           # ровно один источник окна

            past = await c.post(f"{API}/timers",
                                json={"title": "x",
                                      "ends_at": (now - timedelta(hours=1)).isoformat()},
                                headers=ru)
            assert past.status_code == 409
            assert past.json()["error"]["message"] == \
                "Момент окончания должен быть позже начала."

            # --- фильтры состояний ---------------------------------------------
            active = await c.get(f"{API}/timers",
                                 params={"state": "active"}, headers=officer)
            assert active.json()["total"] == 2
            expired = await c.get(f"{API}/timers",
                                  params={"state": "expired"}, headers=officer)
            assert expired.json()["total"] == 0

            # --- complete / reopen ----------------------------------------------
            done = await c.patch(f"{API}/timers/{tid}",
                                 json={"completed": True}, headers=ru)
            assert done.json()["message"] == "Таймер «Decay» завершён."
            assert done.json()["timer"]["completed_at"] is not None
            assert done.json()["timer"]["remaining_seconds"] == 0

            completed = await c.get(f"{API}/timers",
                                    params={"state": "completed"}, headers=officer)
            assert completed.json()["total"] == 1

            reopen = await c.patch(f"{API}/timers/{tid}",
                                   json={"completed": False}, headers=ru)
            assert reopen.json()["message"] == "Таймер «Decay» переоткрыт."

            # --- RBAC: member не пишет, guest читает ----------------------------
            member = bearer(clan_id="CLAN_A", role=ClanRole.MEMBER)
            no = await c.post(f"{API}/timers",
                              json={"title": "x",
                                    "ends_at": (now + timedelta(hours=1)).isoformat()},
                              headers=member)
            assert no.status_code == 403
            guest = bearer(clan_id="CLAN_A", role=ClanRole.GUEST)
            assert (await c.get(f"{API}/timers", headers=guest)).status_code == 200

            # --- изоляция --------------------------------------------------------
            assert (await c.get(f"{API}/timers", headers=admin_b)).json()["total"] == 0
            g = await c.get(f"{API}/timers/{tid}",
                            headers={**admin_b, "Accept-Language": "ru"})
            assert g.status_code == 404
            assert g.json()["error"]["message"] == "Таймер не найден в вашем клане."
            d = await c.delete(f"{API}/timers/{tid}", headers=admin_b)
            assert d.status_code == 404

            # --- delete -----------------------------------------------------------
            assert (await c.delete(f"{API}/timers/{tid}", headers=officer)).status_code == 204

    run(main())
