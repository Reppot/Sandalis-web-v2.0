"""
E2E-тесты API: аутентификация (JWT / clan-token), RBAC, изоляция кланов
и локализация ответов на реальном PostgreSQL через ASGI-транспорт httpx.
"""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.permissions import ClanRole
from app.main import app
from tests.conftest import (
    bearer,
    run,
    seed_catalog_item,
    seed_clan,
    seed_clan_token,
    seed_stockpile_with_stock,
)

API = "/api/v1"


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")


def test_health_ping(db):
    async def main() -> None:
        async with client() as c:
            r = await c.get(f"{API}/health/ping")
            assert r.status_code == 200
            body = r.json()
            assert body["db"] is True
            assert body["status"] == "ok"

            live = await c.get(f"{API}/health/live")
            assert live.status_code == 200

    run(main())


def test_unauthorized_is_localized(db):
    async def main() -> None:
        async with client() as c:
            r = await c.get(f"{API}/orders", headers={"Accept-Language": "ru"})
            assert r.status_code == 401
            err = r.json()["error"]
            assert err["message"] == "Требуется авторизация в клане."
            assert err["locale"] == "ru"
            assert r.headers["content-language"] == "ru"

    run(main())


def test_orders_flow_tenancy_rbac_i18n(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        await seed_clan("CLAN_B", "Bravo")
        await seed_catalog_item()
        admin_a = bearer(clan_id="CLAN_A")
        admin_b = bearer(clan_id="CLAN_B")

        async with client() as c:
            # --- create (ru локаль для уведомления) --------------------------
            r = await c.post(
                f"{API}/orders",
                json={"title": "Винтовки", "item_code": "rifle", "quantity": 2},
                headers={**admin_a, "Accept-Language": "ru"},
            )
            assert r.status_code == 201, r.text
            created = r.json()
            oid = created["order"]["id"]
            assert created["message"] == "Заказ «Винтовки» создан."
            assert "clan_id" not in created["order"]   # дискриминатор не утёк наружу
            assert r.headers["content-language"] == "ru"

            # --- изоляция: A видит заказ, B — нет ----------------------------
            la = await c.get(f"{API}/orders", headers=admin_a)
            assert la.json()["total"] == 1
            lb = await c.get(f"{API}/orders", headers=admin_b)
            assert lb.json()["total"] == 0

            # --- get по id из чужого клана: 404 на ru и cs -------------------
            g_ru = await c.get(f"{API}/orders/{oid}",
                               headers={**admin_b, "Accept-Language": "ru"})
            assert g_ru.status_code == 404
            assert g_ru.json()["error"]["message"] == \
                f"Заказ {oid} не найден в вашем клане."

            g_cs = await c.get(f"{API}/orders/{oid}",
                               headers={**admin_b, "Accept-Language": "cs"})
            assert g_cs.json()["error"]["message"] == \
                f"Objednávka {oid} ve vašem klanu neexistuje."

            # --- X-Locale приоритетнее Accept-Language -----------------------
            g_x = await c.get(f"{API}/orders/{oid}",
                              headers={**admin_b, "Accept-Language": "ru",
                                       "X-Locale": "cs"})
            assert g_x.headers["content-language"] == "cs"

            # --- валидация -> локализованный 422 -----------------------------
            bad = await c.post(
                f"{API}/orders",
                json={"title": "x", "item_code": "rifle", "quantity": 0},
                headers={**admin_a, "Accept-Language": "ru"},
            )
            assert bad.status_code == 422
            assert bad.json()["error"]["message"] == "Некорректные данные запроса."

            # --- неизвестный код предмета: ошибка домена catalog (cs) --------
            nk = await c.post(
                f"{API}/orders",
                json={"title": "x", "item_code": "nope", "quantity": 1},
                headers={**admin_a, "Accept-Language": "cs"},
            )
            assert nk.status_code == 404
            assert nk.json()["error"]["message"] == \
                "Položka s kódem nope nebyla v katalogu nalezena."

            # --- RBAC: member без orders:delete -> 403 -----------------------
            member = bearer(clan_id="CLAN_A", role=ClanRole.MEMBER)
            d = await c.delete(f"{API}/orders/{oid}",
                               headers={**member, "Accept-Language": "ru"})
            assert d.status_code == 403
            assert d.json()["error"]["message"] == \
                "Недостаточно прав. Требуется доступ: orders:delete."

            # --- officer удалить может ---------------------------------------
            officer = bearer(clan_id="CLAN_A", role=ClanRole.OFFICER)
            d2 = await c.delete(f"{API}/orders/{oid}", headers=officer)
            assert d2.status_code == 204

    run(main())


def test_status_transitions_and_stock(db):
    async def main() -> None:
        await seed_catalog_item()
        await seed_stockpile_with_stock(quantity=5)
        admin = bearer(clan_id="CLAN_A")
        ru = {**admin, "Accept-Language": "ru"}

        async with client() as c:
            r = await c.post(f"{API}/orders",
                             json={"title": "Пара", "item_code": "rifle", "quantity": 2},
                             headers=ru)
            oid = r.json()["order"]["id"]

            for st in ("queued", "in_progress"):
                rr = await c.post(f"{API}/orders/{oid}/status",
                                  json={"status": st}, headers=ru)
                assert rr.status_code == 200, rr.text
            assert rr.json()["message"] == "Статус заказа изменён на «in_progress»."
            assert rr.json()["order"]["status"] == "in_progress"

            # недопустимый переход назад
            back = await c.post(f"{API}/orders/{oid}/status",
                                json={"status": "queued"}, headers=ru)
            assert back.status_code == 409
            assert back.json()["error"]["message"] == \
                "Нельзя перейти из статуса «in_progress» в «queued»."

            # заказ сверх складского остатка
            big = await c.post(f"{API}/orders",
                               json={"title": "Много", "item_code": "rifle", "quantity": 99},
                               headers=ru)
            bid = big.json()["order"]["id"]
            await c.post(f"{API}/orders/{bid}/status",
                         json={"status": "queued"}, headers=ru)
            over = await c.post(f"{API}/orders/{bid}/status",
                                json={"status": "in_progress"}, headers=ru)
            assert over.status_code == 409
            assert over.json()["error"]["message"] == \
                "На складе не хватает «rifle»: нужно 99, доступно 5."

    run(main())


def test_clan_token_auth(db):
    async def main() -> None:
        await seed_clan_token("clan-secret", role=ClanRole.GUEST)
        await seed_catalog_item()

        async with client() as c:
            # guest-токен: читать можно
            ok = await c.get(f"{API}/orders", headers={"X-Clan-Token": "clan-secret"})
            assert ok.status_code == 200
            assert ok.json()["total"] == 0

            # а писать — нет (у GUEST нет orders:write)
            no = await c.post(
                f"{API}/orders",
                json={"title": "x", "item_code": "rifle", "quantity": 1},
                headers={"X-Clan-Token": "clan-secret", "Accept-Language": "en"},
            )
            assert no.status_code == 403
            assert no.json()["error"]["message"] == \
                "Insufficient permissions. Required: orders:write."

            # невалидный токен -> 401
            bad = await c.get(f"{API}/orders", headers={"X-Clan-Token": "wrong"})
            assert bad.status_code == 401

    run(main())
