"""E2E: выдача JWT (dev-token), /auth/me, redeem по пригласительному коду."""
from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.main import app
from tests.conftest import bearer, run, seed_catalog_item, seed_clan

API = "/api/v1"


def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")


def test_dev_token_and_me(db):
    async def main() -> None:
        await seed_catalog_item()
        async with client() as c:
            # ENV=local и DEV_AUTH_SECRET не задан -> dev-выдача разрешена
            r = await c.post(
                f"{API}/auth/dev-token",
                json={"user_id": "u-dev", "clan_id": "CLAN_DEV",
                      "role": "admin", "display_name": "Dev"},
                headers={"Accept-Language": "ru"},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["message"] == "Dev-токен выдан для u-dev."
            assert body["expires_in"] == 3600
            assert body["token_type"] == "bearer"
            token = body["access_token"]
            auth = {"Authorization": f"Bearer {token}"}

            me = await c.get(f"{API}/auth/me", headers=auth)
            assert me.status_code == 200
            m = me.json()
            assert m["user_id"] == "u-dev"
            assert m["clan_id"] == "CLAN_DEV"
            assert m["role"] == "admin"
            assert "orders:write" in m["scopes"]

            # upsert создал клан -> FK целостность, токен реально работает
            created = await c.post(
                f"{API}/orders",
                json={"title": "probe", "item_code": "rifle", "quantity": 1},
                headers=auth,
            )
            assert created.status_code == 201, created.text

            # повторная выдача не понижает существующую роль membership
            again = await c.post(
                f"{API}/auth/dev-token",
                json={"user_id": "u-dev", "clan_id": "CLAN_DEV", "role": "guest"},
            )
            assert again.json()["me"]["role"] == "admin"
            # dev-token ставит и session-cookie (веб-клиент живёт на ней)
            assert f"{settings.SESSION_COOKIE_NAME}=" in again.headers["set-cookie"]

            c.cookies.clear()      # дальше — запросы без какой-либо авторизации
            no = await c.get(f"{API}/auth/me", headers={"Accept-Language": "cs"})
            assert no.status_code == 401
            assert no.json()["error"]["message"] == "Je vyžadováno přihlášení do klanu."

            bad = await c.get(f"{API}/auth/me",
                              headers={"Authorization": "Bearer garbage"})
            assert bad.status_code == 401

    run(main())


def test_redeem_code_flow(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        admin = bearer(clan_id="CLAN_A")
        async with client() as c:
            inv = await c.post(f"{API}/auth/invites",
                               json={"role": "member", "max_uses": 1}, headers=admin)
            assert inv.status_code == 201, inv.text
            code = inv.json()["invite"]["code"]
            assert code.startswith("INV-")
            assert inv.json()["message"] == f"Invite code {code} created."

            ok = await c.post(
                f"{API}/auth/redeem-code",
                json={"code": code, "user_id": "newbie", "display_name": "Newbie"},
                headers={"Accept-Language": "ru"},
            )
            assert ok.status_code == 200, ok.text
            assert ok.json()["message"] == "Вы вступили в клан «Alpha» с ролью «member»."
            token = ok.json()["access_token"]
            # веб-клиент живёт на куке (same-origin прокси), Bearer в теле — для ботов
            assert f"{settings.SESSION_COOKIE_NAME}=" in ok.headers["set-cookie"]

            me = await c.get(f"{API}/auth/me",
                             headers={"Authorization": f"Bearer {token}"})
            assert me.json()["clan_id"] == "CLAN_A"
            assert me.json()["role"] == "member"
            assert me.json()["avatar_url"] is None

            # max_uses=1 исчерпан -> 409 (ru)
            again = await c.post(
                f"{API}/auth/redeem-code",
                json={"code": code, "user_id": "second", "display_name": "Second"},
                headers={"Accept-Language": "ru"},
            )
            assert again.status_code == 409
            assert again.json()["error"]["message"] == \
                "Количество использований кода исчерпано."

            # такого кода нет -> 404 (cs)
            bad = await c.post(
                f"{API}/auth/redeem-code",
                json={"code": "INV-XXXXXX99", "user_id": "x", "display_name": "X"},
                headers={"Accept-Language": "cs"},
            )
            assert bad.status_code == 404
            assert bad.json()["error"]["message"] == \
                "Pozvánkový kód nebyl nalezen nebo byl zrušen."

    run(main())


def test_locale_preference_roundtrip(db):
    async def main() -> None:
        async with client() as c:
            r = await c.post(f"{API}/auth/dev-token", json={"user_id": "u-loc", "clan_id": "CLAN_L"})
            auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
            # стартовый язык — язык запроса при регистрации (здесь DEFAULT_LOCALE)
            assert (await c.get(f"{API}/auth/me", headers=auth)).json()["locale"] == settings.DEFAULT_LOCALE

            saved = await c.put(f"{API}/auth/me/locale", json={"locale": "cs-CZ"}, headers=auth)
            assert saved.status_code == 200, saved.text
            assert saved.json()["locale"] == "cs"
            assert (await c.get(f"{API}/auth/me", headers=auth)).json()["locale"] == "cs"

            bad = await c.put(f"{API}/auth/me/locale", json={"locale": "de"}, headers=auth)
            assert bad.status_code == 422

    run(main())
