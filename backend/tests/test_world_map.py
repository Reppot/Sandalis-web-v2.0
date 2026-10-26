"""Карта «Планирования»: суточный снимок построек из Foxhole War API (моки respx)."""
from __future__ import annotations

import httpx
import respx
from httpx import ASGITransport, AsyncClient

from app.core.permissions import ClanRole
from app.main import app
from app.services import war_api, war_map
from tests.conftest import bearer, run

API = "/api/v1"
ROOT = war_api.API_ROOT

STATIC = {
    "mapTextItems": [
        {"text": "Abandoned Ward", "x": 0.40, "y": 0.50, "mapMarkerType": "Major"},
        {"text": "Biting Tarn", "x": 0.82, "y": 0.70, "mapMarkerType": "Minor"},
    ],
}
DYNAMIC = {
    "mapItems": [
        {"teamId": "WARDENS", "iconType": 58, "x": 0.41, "y": 0.51, "flags": 0x01},    # ратуша T3, город победы
        {"teamId": "COLONIALS", "iconType": 45, "x": 0.2, "y": 0.3, "flags": 0},        # реликвия
        {"teamId": "NONE", "iconType": 33, "x": 0.42, "y": 0.49, "flags": 0},           # склад
        {"teamId": "WARDENS", "iconType": 52, "x": 0.81, "y": 0.69, "flags": 0},        # порт
        {"teamId": "COLONIALS", "iconType": 53, "x": 0.6, "y": 0.6, "flags": 0},        # береговое орудие
        {"teamId": "WARDENS", "iconType": 92, "x": 0.5, "y": 0.2, "flags": 0},          # аэродром T2
        {"teamId": "NONE", "iconType": 20, "x": 0.10, "y": 0.10, "flags": 0},           # поле сальвиджа — не нужно
    ],
}


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _mock(mock: respx.MockRouter, maps: list[str], war: dict | None = None) -> respx.Route:
    mock.get(f"{ROOT}/war").respond(json=war or {"warNumber": 141, "winner": "NONE"})
    mock.get(f"{ROOT}/maps").respond(json=maps)
    route = mock.get(f"{ROOT}/maps/DeadLandsHex/dynamic/public").respond(json=DYNAMIC)
    mock.get(f"{ROOT}/maps/DeadLandsHex/static").respond(json=STATIC)
    mock.get(f"{ROOT}/maps/UnknownHex/static").respond(json={})
    mock.get(f"{ROOT}/maps/UnknownHex/dynamic/public").respond(json={})
    return route


def test_map_snapshot_keeps_only_planning_buildings(db):
    async def main() -> None:
        war_api.reset_cache()
        war_map.reset_snapshot()
        with respx.mock(assert_all_called=False) as mock:
            dynamic = _mock(mock, ["DeadLandsHex", "UnknownHex"])
            async with client() as c:
                r = await c.get(f"{API}/world/map", headers=bearer(role=ClanRole.GUEST))
                assert r.status_code == 200, r.text
                body = r.json()
                assert body["war_number"] == 141
                assert body["phase"] == "conquest" and body["winner"] is None
                [region] = body["regions"]                     # регион вне раскладки пропущен
                assert (region["slug"], region["name"], region["col"], region["row"]) == ("deadlands", "Deadlands", 6, 6)
                kinds = {(i["kind"], i["tier"], i["team"]) for i in region["items"]}
                assert kinds == {
                    ("town_hall", 3, "wardens"), ("relic", 1, "colonials"), ("storage", None, "neutral"),
                    ("seaport", None, "wardens"), ("coastal_gun", None, "colonials"), ("runway", 2, "wardens"),
                }
                assert next(i for i in region["items"] if i["kind"] == "town_hall")["victory"] is True
                assert region["labels"] == [
                    {"text": "Abandoned Ward", "x": 0.4, "y": 0.5, "major": True},
                    {"text": "Biting Tarn", "x": 0.82, "y": 0.7, "major": False},
                ]

                # снимок суточный: повторный запрос War API не трогает
                war_api.reset_cache()
                assert (await c.get(f"{API}/world/map", headers=bearer(role=ClanRole.GUEST))).status_code == 200
                assert dynamic.call_count == 1

    run(main())


def test_map_keeps_last_snapshot_when_war_api_fails(db):
    async def main() -> None:
        war_api.reset_cache()
        war_map.reset_snapshot()
        async with client() as c:
            with respx.mock(assert_all_called=False) as mock:
                _mock(mock, ["DeadLandsHex"])
                assert (await c.get(f"{API}/world/map", headers=bearer(role=ClanRole.GUEST))).status_code == 200
            war_api.reset_cache()
            war_map._snap.built -= war_map.SNAPSHOT_TTL + 1     # снимок устарел
            with respx.mock(assert_all_called=False) as mock:
                mock.get(f"{ROOT}/war").mock(side_effect=httpx.ConnectError("down"))
                r = await c.get(f"{API}/world/map", headers=bearer(role=ClanRole.GUEST))
                assert r.status_code == 200 and r.json()["regions"][0]["slug"] == "deadlands"

            war_map.reset_snapshot()
            with respx.mock(assert_all_called=False) as mock:
                mock.get(f"{ROOT}/war").mock(side_effect=httpx.ConnectError("down"))
                r = await c.get(f"{API}/world/map", headers=bearer(role=ClanRole.GUEST))
                assert r.status_code == 502 and r.json()["error"]["code"] == "war_api_unavailable"

    run(main())


def test_resistance_shows_only_hexes_and_towns(db):
    async def main() -> None:
        war_api.reset_cache()
        war_map.reset_snapshot()
        with respx.mock(assert_all_called=False) as mock:
            _mock(mock, ["DeadLandsHex"], war={"warNumber": 141, "winner": "WARDENS", "resistanceStartTime": 1})
            async with client() as c:
                r = await c.get(f"{API}/world/map", headers=bearer(role=ClanRole.GUEST))
                assert r.status_code == 200, r.text
                body = r.json()
                assert (body["phase"], body["winner"]) == ("resistance", "wardens")
                [region] = body["regions"]
                assert region["items"] == [] and len(region["labels"]) == 2

    run(main())
