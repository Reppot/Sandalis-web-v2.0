"""Пирамида снабжения клана: шаблон, сохранение, права, проверка предметов."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.permissions import ClanRole
from app.domain.pyramid import DEFAULT_TIERS, PRESETS
from app.main import app
from tests.conftest import bearer, run, seed_catalog_item, seed_clan

API = "/api/v1"


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def test_pyramid_default_save_and_reset(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        await seed_catalog_item("SoldierSupplies")
        await seed_catalog_item("Cloth")
        member = bearer(clan_id="CLAN_A", role=ClanRole.MEMBER)
        officer = bearer(clan_id="CLAN_A", role=ClanRole.OFFICER)
        async with client() as c:
            r = await c.get(f"{API}/clan/pyramid", headers=member)
            assert r.status_code == 200, r.text
            assert r.json()["is_default"] and len(r.json()["tiers"]) == len(DEFAULT_TIERS)
            assert [p["key"] for p in r.json()["presets"]] == list(PRESETS)

            body = {"faction": "colonial", "tiers": [{"title": "Основа", "items": [{"code": "SoldierSupplies", "crates": 25}, {"code": "Cloth", "crates": 40}]}]}
            assert (await c.put(f"{API}/clan/pyramid", json=body, headers=member)).status_code == 403   # нужен stockpiles:edit
            saved = await c.put(f"{API}/clan/pyramid", json=body, headers=officer)
            assert saved.status_code == 200, saved.text
            assert saved.json()["is_default"] is False and saved.json()["faction"] == "colonial"
            assert (await c.get(f"{API}/clan/pyramid", headers=member)).json()["tiers"][0]["items"][0]["crates"] == 25

            bad = {"faction": "warden", "tiers": [{"items": [{"code": "NoSuchItem", "crates": 1}]}]}
            r = await c.put(f"{API}/clan/pyramid", json=bad, headers=officer)
            assert r.status_code == 422 and "NoSuchItem" in r.json()["error"]["message"]

            reset = await c.delete(f"{API}/clan/pyramid", headers=officer)
            assert reset.status_code == 200 and reset.json()["is_default"]

            # чужой клан своей пирамиды не видит — у него шаблон
            await seed_clan("CLAN_B", name="Beta")
            await c.put(f"{API}/clan/pyramid", json=body, headers=officer)
            other = await c.get(f"{API}/clan/pyramid", headers=bearer(clan_id="CLAN_B", role=ClanRole.MEMBER))
            assert other.json()["is_default"]

    run(main())


def test_preset_items_exist_in_catalog():
    import json
    from pathlib import Path

    catalog = {x["code"] for x in json.loads((Path(__file__).resolve().parents[1] / "app/seed/data/catalog.json").read_text(encoding="utf-8"))}
    missing = {key: [c for t in tiers for c, _ in t["items"] if c not in catalog] for key, tiers in PRESETS.items()}
    assert not any(missing.values()), missing
