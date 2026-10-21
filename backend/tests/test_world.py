"""Регионы и города: агрегирование официального Foxhole War API (моки respx)."""
from __future__ import annotations

import httpx
import respx
from httpx import ASGITransport, AsyncClient

from app.core.permissions import ClanRole
from app.main import app
from app.services import war_api
from tests.conftest import bearer, run

API = "/api/v1"
ROOT = war_api.API_ROOT

STATIC = {
    "mapTextItems": [
        {"text": "Abandoned Ward", "x": 0.40, "y": 0.50, "mapMarkerType": "Major"},
        {"text": "Brine Glen", "x": 0.72, "y": 0.72, "mapMarkerType": "Major"},
        {"text": "Biting Tarn", "x": 0.82, "y": 0.70, "mapMarkerType": "Minor"},
    ],
}
DYNAMIC = {
    "mapItems": [
        {"teamId": "WARDENS", "iconType": 56, "x": 0.41, "y": 0.51, "flags": 0x01},   # ратуша, город победы
        {"teamId": "COLONIALS", "iconType": 57, "x": 0.71, "y": 0.73, "flags": 0},
        {"teamId": "WARDENS", "iconType": 33, "x": 0.42, "y": 0.49, "flags": 0},      # депо
        {"teamId": "NONE", "iconType": 52, "x": 0.81, "y": 0.69, "flags": 0},         # порт у малой отметки
        {"teamId": "NONE", "iconType": 20, "x": 0.10, "y": 0.10, "flags": 0},         # поле сальвиджа — не постройка города
    ],
}


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def test_regions_aggregate_towns_owners_and_facilities(db):
    async def main() -> None:
        war_api.reset_cache()
        with respx.mock(assert_all_called=False) as mock:
            mock.get(f"{ROOT}/war").respond(json={"warNumber": 141, "winner": "NONE", "requiredVictoryTowns": 34, "conquestStartTime": 1})
            mock.get(f"{ROOT}/maps").respond(json=["DeadLandsHex"])
            static = mock.get(f"{ROOT}/maps/DeadLandsHex/static").respond(json=STATIC, headers={"ETag": '"s1"'})
            mock.get(f"{ROOT}/maps/DeadLandsHex/dynamic/public").respond(json=DYNAMIC, headers={"ETag": '"d1"'})
            async with client() as c:
                r = await c.get(f"{API}/world/regions", headers=bearer(role=ClanRole.GUEST))
                assert r.status_code == 200, r.text
                body = r.json()
                assert body["war"]["number"] == 141
                assert body["war"]["victory_towns"] == {"colonials": 0, "wardens": 1}
                [region] = body["regions"]
                assert region["name"] == "Deadlands" and (region["wardens"], region["colonials"], region["victory"]) == (1, 1, 1)
                towns = {t["name"]: t for t in region["towns"]}
                assert towns["Abandoned Ward"]["owner"] == "wardens" and towns["Abandoned Ward"]["victory"]
                assert towns["Abandoned Ward"]["facilities"] == ["storage"]
                assert towns["Brine Glen"]["owner"] == "colonials"
                assert towns["Biting Tarn"]["facilities"] == ["seaport"] and towns["Biting Tarn"]["owner"] is None

                # повтор в пределах TTL — из кеша, War API не дёргаем
                assert (await c.get(f"{API}/world/regions", headers=bearer(role=ClanRole.GUEST))).status_code == 200
                assert static.call_count == 1

    run(main())


def test_regions_report_war_api_outage(db):
    async def main() -> None:
        war_api.reset_cache()
        with respx.mock(assert_all_called=False) as mock:
            mock.get(f"{ROOT}/war").mock(side_effect=httpx.ConnectError("down"))
            async with client() as c:
                r = await c.get(f"{API}/world/regions", headers=bearer(role=ClanRole.GUEST))
                assert r.status_code == 502
                assert r.json()["error"]["code"] == "war_api_unavailable"

    run(main())
