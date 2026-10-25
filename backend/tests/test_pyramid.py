"""Пирамида снабжения клана: шаблон, сохранение, права, проверка предметов."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.permissions import ClanRole
from app.domain.pyramid import DEFAULT_TIERS, PRESETS
from app.main import app
from app.core.db import AsyncSessionLocal
from app.core.tenancy import clan_scope
from app.models.clan_settings import ClanSettings
from tests.conftest import bearer, run, seed_catalog_item, seed_clan

API = "/api/v1"


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def test_pyramid_named_configs(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        await seed_catalog_item("SoldierSupplies")
        await seed_catalog_item("Cloth")
        member = bearer(clan_id="CLAN_A", role=ClanRole.MEMBER)
        officer = bearer(clan_id="CLAN_A", role=ClanRole.OFFICER)
        tiers = [{"title": "Основа", "items": [{"code": "SoldierSupplies", "crates": 25}, {"code": "Cloth", "crates": 40}]}]
        async with client() as c:
            r = await c.get(f"{API}/clan/pyramid", headers=member)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["is_default"] and len(body["tiers"]) == len(DEFAULT_TIERS)
            assert [p["key"] for p in body["presets"]] == list(PRESETS)
            assert body["configs"] == [] and body["max_configs"] == 10

            new = {"name": "  Фронт   Морей ", "faction": "colonial", "tiers": tiers}
            assert (await c.post(f"{API}/clan/pyramid/configs", json=new, headers=member)).status_code == 403
            created = await c.post(f"{API}/clan/pyramid/configs", json=new, headers=officer)
            assert created.status_code == 201, created.text
            [cfg] = created.json()["configs"]
            assert cfg["name"] == "Фронт Морей" and cfg["faction"] == "colonial" and cfg["updated_by"]
            # участники видят конфигурацию клана в общем списке
            assert (await c.get(f"{API}/clan/pyramid", headers=member)).json()["configs"][0]["id"] == cfg["id"]

            dup = await c.post(f"{API}/clan/pyramid/configs", json={**new, "name": "фронт морей"}, headers=officer)
            assert dup.status_code == 409

            renamed = await c.put(f"{API}/clan/pyramid/configs/{cfg['id']}", json={**new, "name": "Фронт"}, headers=officer)
            assert renamed.status_code == 200 and renamed.json()["configs"][0]["name"] == "Фронт"

            bad = {"name": "X", "faction": "warden", "tiers": [{"items": [{"code": "NoSuchItem", "crates": 1}]}]}
            r = await c.post(f"{API}/clan/pyramid/configs", json=bad, headers=officer)
            assert r.status_code == 422 and "NoSuchItem" in r.json()["error"]["message"]

            # техника и сооружения в кастомную пирамиду не добавляются
            await seed_catalog_item("TruckW", category="vehicles")
            vehicle = {"name": "Y", "faction": "warden", "tiers": [{"items": [{"code": "TruckW", "crates": 2}]}]}
            r = await c.post(f"{API}/clan/pyramid/configs", json=vehicle, headers=officer)
            assert r.status_code == 422 and "TruckW" in r.json()["error"]["message"]

            # не больше 10 на клан
            for n in range(9):
                assert (await c.post(f"{API}/clan/pyramid/configs", json={**new, "name": f"К{n}"}, headers=officer)).status_code == 201
            over = await c.post(f"{API}/clan/pyramid/configs", json={**new, "name": "Лишняя"}, headers=officer)
            assert over.status_code == 409 and "10" in over.json()["error"]["message"]

            deleted = await c.delete(f"{API}/clan/pyramid/configs/{cfg['id']}", headers=officer)
            assert deleted.status_code == 200 and len(deleted.json()["configs"]) == 9
            assert (await c.delete(f"{API}/clan/pyramid/configs/{cfg['id']}", headers=officer)).status_code == 404

            # чужой клан конфигураций не видит
            await seed_clan("CLAN_B", name="Beta")
            other = await c.get(f"{API}/clan/pyramid", headers=bearer(clan_id="CLAN_B", role=ClanRole.MEMBER))
            assert other.json()["configs"] == []

    run(main())


def test_legacy_single_pyramid_becomes_named_config(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        async with AsyncSessionLocal() as s:
            with clan_scope("CLAN_A"):
                s.add(ClanSettings(supply_pyramid={"faction": "warden", "tiers": [{"title": "", "items": [{"code": "Cloth", "crates": 5}]}]}))
                await s.commit()
        async with client() as c:
            body = (await c.get(f"{API}/clan/pyramid", headers=bearer(clan_id="CLAN_A", role=ClanRole.MEMBER))).json()
            assert [(x["id"], x["name"]) for x in body["configs"]] == [("legacy", "Пирамида клана")]

    run(main())


def test_preset_items_exist_in_catalog():
    import json
    from pathlib import Path

    catalog = {x["code"] for x in json.loads((Path(__file__).resolve().parents[1] / "app/seed/data/catalog.json").read_text(encoding="utf-8"))}
    missing = {key: [c for t in tiers for c, _ in t["items"] if c not in catalog] for key, tiers in PRESETS.items()}
    assert not any(missing.values()), missing
