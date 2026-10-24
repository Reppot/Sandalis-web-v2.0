"""E2E: перенос инструментов старого сайта на бэкенд — сид справочников, контент,
рецепты, разбор отчётов сканера, монитор склада, журнал таймеров, рапорты и Discord."""
from __future__ import annotations

import json
import struct
from datetime import UTC, datetime, timedelta

import respx
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.core.db import AsyncSessionLocal, engine
from app.core.permissions import ClanRole
from app.main import app
from app.models.recipe import ProductionRecipe
from app.seed import load, run as run_seed
from tests.conftest import bearer, run, seed_catalog_item, seed_clan

API = "/api/v1"
WEBHOOK = "https://discord.com/api/webhooks/123/secret-token-abcd"


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")


def test_seed_is_idempotent_and_matches_counts(db):
    async def main() -> None:
        async with engine.begin() as conn:
            first = await run_seed(conn)
        async with engine.begin() as conn:
            second = await run_seed(conn)
        await engine.dispose()
        assert first["catalog"] == len(load("catalog.json")) > 300
        assert first["recipes"] == len(load("recipes.json")) > 200
        assert first["content_inserted"] == len(load("content.json"))
        assert second["content_inserted"] == 0          # правки контента сид не трогает

        async with client() as c:
            auth = bearer(role=ClanRole.GUEST)
            await seed_clan()
            items = await c.get(f"{API}/items", params={"query": "AAAmmo"}, headers=auth)
            assert items.status_code == 200
            first_item = items.json()["items"][0]
            assert first_item["code"] == "AAAmmo"
            assert first_item["icon_url"].startswith("/api/v1/assets/items/")

            factory = await c.get(f"{API}/recipes", params={"facility": "mpf"}, headers=auth)
            assert factory.status_code == 200
            assert factory.json() and all("mpf" in r["facilities"] for r in factory.json())
            refinery = await c.get(f"{API}/recipes", params={"kind": "refinery"}, headers=auth)
            assert {r["id"] for r in refinery.json()} >= {"refinery-bmat", "refinery-rmat"}
            facility = (await c.get(f"{API}/recipes", params={"kind": "facility"}, headers=auth)).json()
            assert len(facility) == len(load("facility_recipes.json")) > 300
            # у одного предмета несколько рецептов: Concrete Mixer и два режима Coal Refinery
            concrete = [r for r in facility if r["name"] == "Concrete Materials"]
            assert len(concrete) >= 2 and all(r["data"]["inputs"] for r in concrete)

            icon = await c.get(first_item["icon_url"])
            assert icon.status_code == 200

    run(main())


def test_content_public_read_and_owner_only_write(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        await seed_clan("CLAN_B", name="Beta")
        settings.CONTENT_ADMIN_CLAN_ID = "CLAN_A"
        try:
            async with client() as c:
                body = {"payload": {"type": "video", "url": "https://cdn.example/v.mp4"}}
                foreign = await c.put(f"{API}/content/media/login_video", json=body,
                                      headers=bearer(clan_id="CLAN_B"))
                assert foreign.status_code == 403
                member = await c.put(f"{API}/content/media/login_video", json=body,
                                     headers=bearer(role=ClanRole.MEMBER))
                assert member.status_code == 403
                ok = await c.put(f"{API}/content/media/login_video", json=body, headers=bearer())
                assert ok.status_code == 200, ok.text

                public = await c.get(f"{API}/content", params={"kind": "media"})
                assert public.status_code == 200
                assert public.json()[0]["payload"]["url"] == "https://cdn.example/v.mp4"
        finally:
            settings.CONTENT_ADMIN_CLAN_ID = None

    run(main())


def test_parse_resolve_and_scan(db):
    async def main() -> None:
        await seed_clan()
        await seed_catalog_item("Bandages", category="medical", name="Бинты", english_name="Bandages")
        await seed_catalog_item("RifleW", name="Винтовка", english_name="Rifle")
        auth = bearer(role=ClanRole.GUEST)
        async with client() as c:
            parsed = await c.post(f"{API}/items/parse", headers=auth, json={
                "text": "Бинты (Ящик),12\nRifle -> 3 шт.\nНеизвестное, 5",
            })
            assert parsed.status_code == 200, parsed.text
            data = parsed.json()
            assert [(l["name"], l["count"], l["unit"]) for l in data["lines"]] == [
                ("Бинты", 12, "crate"), ("Rifle", 3, "unit"), ("Неизвестное", 5, "unit"),
            ]
            assert data["lines"][0]["item"]["code"] == "Bandages"
            assert data["matched"] == 2 and data["unknown"] == ["Неизвестное"]

            resolved = await c.post(f"{API}/items/resolve", headers=auth,
                                    json={"names": ["винтовка", "???"]})
            assert [r["item"] and r["item"]["code"] for r in resolved.json()] == ["RifleW", None]

            sav = (b"Bandages\x00..Int16Property" + b"\x00" * 9 + struct.pack("<h", 7)
                   + b"\x00" * 30)
            scan = await c.post(f"{API}/items/scan", headers=auth,
                                files={"file": ("MapData.sav", sav, "application/octet-stream")})
            assert scan.status_code == 200, scan.text
            assert scan.json()["strict"] is True
            assert [(l["item"]["code"], l["count"]) for l in scan.json()["lines"]] == [("Bandages", 7)]

    run(main())


def test_stockpile_contents_replace(db):
    async def main() -> None:
        await seed_clan()
        await seed_catalog_item("Bandages", category="medical", name="Бинты")
        await seed_catalog_item("RifleW", name="Винтовка")
        auth = bearer(role=ClanRole.MEMBER)
        async with client() as c:
            sp = (await c.post(f"{API}/stockpiles", headers=auth,
                               json={"name": "Port", "region": "Deadlands"})).json()["stockpile"]
            put = await c.put(f"{API}/stockpiles/{sp['id']}/items", headers=auth, json={
                "source": "clipboard",
                "items": [{"item_code": "Bandages", "quantity": 5},
                          {"item_code": "Bandages", "quantity": 7},
                          {"item_code": "RifleW", "quantity": 2}],
            })
            assert put.status_code == 200, put.text
            detail = put.json()["stockpile"]
            assert detail["last_sync_source"] == "clipboard" and detail["last_sync_at"]
            assert {(i["item_code"], i["quantity"], i["name"]) for i in detail["items"]} == {
                ("Bandages", 12, "Бинты"), ("RifleW", 2, "Винтовка"),
            }

            unknown = await c.put(f"{API}/stockpiles/{sp['id']}/items", headers=auth, json={
                "items": [{"item_code": "Nope", "quantity": 1}],
            })
            assert unknown.status_code == 404
            still = (await c.get(f"{API}/stockpiles/{sp['id']}", headers=auth)).json()
            assert still["items_count"] == 2      # ошибка не стёрла содержимое

            cleared = await c.put(f"{API}/stockpiles/{sp['id']}/items", headers=auth,
                                  json={"items": []})
            assert cleared.json()["stockpile"]["items"] == []

    run(main())


def test_timer_restart_and_events(db):
    async def main() -> None:
        await seed_clan()
        auth = bearer(role=ClanRole.OFFICER)
        async with client() as c:
            ends = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
            timer = (await c.post(f"{API}/timers", headers=auth,
                                  json={"title": "Port", "ends_at": ends})).json()["timer"]

            restarted = await c.patch(f"{API}/timers/{timer['id']}", headers=auth,
                                      json={"restart": True, "duration_seconds": 172800})
            assert restarted.status_code == 200, restarted.text
            t = restarted.json()["timer"]
            assert t["duration_seconds"] == 172800
            assert 172700 < t["remaining_seconds"] <= 172800

            note = await c.post(f"{API}/timers/{timer['id']}/events", headers=auth,
                                json={"message": "Обновил в игре"})
            assert note.status_code == 201, note.text

            events = (await c.get(f"{API}/timers/{timer['id']}/events", headers=auth)).json()
            assert len(events) == 3                  # создан, перезапущен, заметка
            assert events[-1]["message"] == "Обновил в игре"

            guest = await c.post(f"{API}/timers/{timer['id']}/events",
                                 headers=bearer(role=ClanRole.GUEST), json={"message": "x"})
            assert guest.status_code == 403

    run(main())


def test_report_line_icon_falls_back_to_recipe_by_name(db):
    """Строка без кода каталога (постройка из калькулятора завода) берёт иконку рецепта,
    а мягкий поиск не подменяет её чужим предметом («Titan» ≠ «Anti-Tank Grenade»)."""
    async def main() -> None:
        await seed_clan()
        await seed_catalog_item("ATLaunchedGrenadeW", category="weapons", english_name="B2 Varsi Anti-Tank Grenade")
        async with AsyncSessionLocal() as s:
            s.add(ProductionRecipe(
                id="facility-titan", kind="facility", name="Titan", name_en="Titan", item_code=None,
                category="shipyard", factions=["colonial"], facilities=["shipyard"],
                icon_url="/api/v1/assets/items/LargeShipBattleshipC.png", cost={}, data={},
            ))
            await s.commit()
        async with client() as c:
            created = await c.post(f"{API}/reports", headers=bearer(role=ClanRole.MEMBER), json={
                "title": "Флот", "meta": {"type": "factory"},
                "lines": [{"name": "Titan", "quantity": 1, "unit": "unit"}],
            })
            assert created.status_code == 201, created.text
            line = created.json()["report"]["lines"][0]
            assert line["item_code"] is None
            assert line["icon_url"] == "/api/v1/assets/items/LargeShipBattleshipC.png"

    run(main())


def test_reports_lifecycle_and_isolation(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        await seed_clan("CLAN_B", name="Beta")
        await seed_catalog_item("Bandages", category="medical", name="Бинты")
        member = bearer(role=ClanRole.MEMBER)
        async with client() as c:
            created = await c.post(f"{API}/reports", headers=member, json={
                "title": "SS на порт",
                "meta": {"region": "Deadlands", "type": "ПОРТ", "stockpile": "Public"},
                "lines": [{"name": "Бинты", "quantity": 10, "unit": "crate"},
                          {"name": "Что-то новое", "quantity": 3, "unit": "unit"}],
            })
            assert created.status_code == 201, created.text
            report = created.json()["report"]
            assert report["status"] == "open"
            assert [l["item_code"] for l in report["lines"]] == ["Bandages", None]
            assert report["lines_count"] == 2 and report["total_quantity"] == 13

            listed = await c.get(f"{API}/reports", headers=member, params={"status": "open"})
            assert listed.json()["total"] == 1
            assert (await c.get(f"{API}/reports", headers=bearer(clan_id="CLAN_B"))).json()["total"] == 0
            foreign = await c.get(f"{API}/reports/{report['id']}", headers=bearer(clan_id="CLAN_B"))
            assert foreign.status_code == 404

            done = await c.post(f"{API}/reports/{report['id']}/status", headers=member,
                                json={"status": "done"})
            assert done.json()["report"]["status"] == "done"
            bad = await c.post(f"{API}/reports/{report['id']}/status", headers=member,
                               json={"status": "cancelled"})
            assert bad.status_code == 409

            edited = await c.patch(f"{API}/reports/{report['id']}", headers=member,
                                   json={"lines": [{"name": "Бинты", "quantity": 4}]})
            assert edited.json()["report"]["total_quantity"] == 4

            assert (await c.delete(f"{API}/reports/{report['id']}", headers=member)).status_code == 403
            assert (await c.delete(f"{API}/reports/{report['id']}",
                                   headers=bearer(role=ClanRole.OFFICER))).status_code == 204

    run(main())


def test_report_discord_webhook(db):
    async def main() -> None:
        await seed_clan()
        member = bearer(role=ClanRole.MEMBER)
        admin = bearer(role=ClanRole.ADMIN)
        async with client() as c:
            report = (await c.post(f"{API}/reports", headers=member, json={
                "lines": [{"name": "Бинты", "quantity": 10}],
            })).json()["report"]

            missing = await c.post(f"{API}/reports/{report['id']}/discord", headers=member)
            assert missing.status_code == 409
            assert missing.json()["error"]["code"] == "discord_not_configured"

            bad_url = await c.put(f"{API}/clan/settings", headers=admin,
                                  json={"discord_webhook_url": "https://evil.example/hook"})
            assert bad_url.status_code == 422
            assert (await c.put(f"{API}/clan/settings", headers=member,
                                json={"discord_webhook_url": WEBHOOK})).status_code == 403
            saved = await c.put(f"{API}/clan/settings", headers=admin,
                                json={"discord_webhook_url": WEBHOOK})
            assert saved.status_code == 200, saved.text
            assert saved.json()["settings"] == {
                "discord_webhook_configured": True, "discord_webhook_hint": "…/abcd",
            }
            assert WEBHOOK not in (await c.get(f"{API}/clan/settings", headers=member)).text

            with respx.mock(assert_all_mocked=False) as mock:
                route = mock.post(WEBHOOK).respond(204)
                sent = await c.post(f"{API}/reports/{report['id']}/discord", headers=member,
                                    files={"image": ("r.png", b"\x89PNG fake", "image/png")})
                assert sent.status_code == 200, sent.text
                assert sent.json()["report"]["discord_sent_at"]
                body = route.calls.last.request.content
                assert b"payload_json" in body and b"attachment://report.png" in body

            with respx.mock(assert_all_mocked=False) as mock:
                mock.post(WEBHOOK).respond(404, json={"message": "Unknown Webhook"})
                gone = await c.post(f"{API}/reports/{report['id']}/discord", headers=member)
                assert gone.status_code == 409
                assert gone.json()["error"]["code"] == "discord_webhook_invalid"

            with respx.mock(assert_all_mocked=False) as mock:
                route = mock.post(WEBHOOK).respond(204)
                plain = await c.post(f"{API}/reports/{report['id']}/discord", headers=member)
                assert plain.status_code == 200
                embed = json.loads(route.calls.last.request.content)["embeds"][0]
                assert "Бинты" in embed["description"]

    run(main())
