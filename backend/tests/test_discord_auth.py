"""E2E: Discord OAuth (stateless JWT) — success and failure paths.

Дискорд не вызывается: httpx-транспорт мокается через respx (продакшн-код
получает клиента из фабрики get_http_client() -> дефолтный транспорт -> respx
его перехватывает, а ASGI-транспорт тестового клиента остаётся нетронутым).
"""

from __future__ import annotations

from contextlib import contextmanager
from urllib.parse import parse_qs
from types import SimpleNamespace
from typing import Any, Iterator

import respx
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.core.i18n import Translator
from app.core.permissions import ClanRole
from app.core.security import issue_access_token
from app.core.tenancy import bypass_clan_filter
from app.core.db import AsyncSessionLocal
from app.main import app
from app.models.rbac import Clan, ClanMembership, User
from app.services.discord_oauth import make_state, verify_state
from tests.conftest import run, seed_catalog_item, seed_clan, seed_stockpile_with_stock

API = "/api/v1"
BASE = settings.DISCORD_API_BASE_URL
DISCORD_ID = "123456789012345678"

TOKEN_RESPONSE: dict[str, Any] = {
    "access_token": "discord-access-token",
    "token_type": "Bearer",
    "expires_in": 604800,
    "refresh_token": "discord-refresh-token",
    "scope": "identify",
}

PROFILE: dict[str, Any] = {
    "id": DISCORD_ID,
    "username": "reppot",
    "global_name": "Reppot",
    "avatar": "0123456789abcdef0123456789abcdef",
    "locale": "ru",
}


def client() -> AsyncClient:
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
        follow_redirects=False,
    )


def enable_discord(monkeypatch) -> None:
    monkeypatch.setattr(settings, "DISCORD_CLIENT_ID", "client-123", raising=True)
    monkeypatch.setattr(settings, "DISCORD_CLIENT_SECRET", "secret-456", raising=True)
    monkeypatch.setattr(
        settings,
        "DISCORD_REDIRECT_URI",
        "http://testserver/api/v1/auth/discord/callback",
        raising=True,
    )


@contextmanager
def discord_mock(
    *, token_status: int = 200, profile_status: int = 200, guilds: list[dict] | None = None
) -> Iterator[SimpleNamespace]:
    with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
        token = mock.post(f"{BASE}/oauth2/token").respond(
            status_code=token_status,
            json=TOKEN_RESPONSE if token_status // 100 == 2 else {"error": "invalid_grant"},
        )
        profile = mock.get(f"{BASE}/users/@me").respond(
            status_code=profile_status,
            json=PROFILE if profile_status // 100 == 2 else {"message": "401: Unauthorized"},
        )
        owned = mock.get(f"{BASE}/users/@me/guilds").respond(status_code=200, json=guilds or [])
        yield SimpleNamespace(token=token, profile=profile, guilds=owned)


async def seed_membership(
    clan_id: str,
    user_id: str = DISCORD_ID,
    role: ClanRole = ClanRole.MEMBER,
    *,
    active: bool = True,
) -> None:
    async with AsyncSessionLocal() as s:
        with bypass_clan_filter():
            if (
                await s.execute(select(Clan).where(Clan.id == clan_id))
            ).scalar_one_or_none() is None:      # seed_clan() мог уже создать
                s.add(Clan(id=clan_id, name=clan_id))
            if (
                await s.execute(select(User).where(User.id == user_id))
            ).scalar_one_or_none() is None:
                s.add(User(id=user_id, display_name="Old Name"))
            s.add(
                ClanMembership(
                    clan_id=clan_id,
                    user_id=user_id,
                    role=role,
                    extra_scopes=[],
                    revoked_scopes=[],
                    is_active=active,
                )
            )
            await s.commit()


def tr(locale: str) -> Translator:
    return Translator(locale=locale, default_domain="auth")


# --------------------------------------------------------------------------- #
# GET /discord/login
# --------------------------------------------------------------------------- #
def test_login_disabled_localized(db):
    async def main() -> None:
        async with client() as c:
            for locale, expected in (
                ("ru", "Вход через Discord отключён в этом окружении."),
                ("en", "Discord login is disabled in this environment."),
                ("cs", "Přihlášení přes Discord je v tomto prostředí vypnuto."),
            ):
                r = await c.get(f"{API}/auth/discord/login", headers={"X-Locale": locale})
                assert r.status_code == 503, (locale, r.status_code, r.text)
                body = r.json()
                assert body["error"]["code"] == "disabled"
                assert body["error"]["message"] == expected, (locale, body)
                assert body["error"]["locale"] == locale
                assert tr(locale).t("discord.disabled") == expected

    run(main())


def test_login_redirects_to_discord_with_signed_state(db, monkeypatch):
    async def main() -> None:
        enable_discord(monkeypatch)
        async with client() as c:
            r = await c.get(
                f"{API}/auth/discord/login",
                params={"clan_id": "CLAN_A", "return_to": "/cabinet"},
            )
            assert r.status_code == 302, r.text
            location = r.headers["location"]
            assert location.startswith(settings.DISCORD_AUTHORIZE_URL)
            assert "client_id=client-123" in location
            assert "scope=identify+guilds" in location
            assert "response_type=code" in location
            assert (
                "redirect_uri=http%3A%2F%2Ftestserver%2Fapi%2Fv1%2Fauth%2Fdiscord%2Fcallback"
                in location
            )
            raw_state = location.split("state=", 1)[1].split("&")[0]
            state = verify_state(raw_state)      # подписано и читаемо нами
            assert state.clan_id == "CLAN_A"
            assert state.return_to == "/cabinet"
            assert state.nonce

            # два логина -> два разных state (nonce не переиспользуется)
            again = await c.get(f"{API}/auth/discord/login", params={"clan_id": "CLAN_A"})
            assert again.headers["location"] != location

    run(main())


# --------------------------------------------------------------------------- #
# GET /discord/callback — cookie mode
# --------------------------------------------------------------------------- #
def test_callback_success_sets_cookie_and_me_works(db, monkeypatch):
    async def main() -> None:
        await seed_clan("CLAN_A")
        await seed_membership("CLAN_A", role=ClanRole.OFFICER)
        enable_discord(monkeypatch)
        state = make_state(clan_id="CLAN_A", return_to="/cabinet")

        with discord_mock() as mock:
            async with client() as c:
                r = await c.get(f"{API}/auth/discord/callback", params={"code": "abc", "state": state})
                assert r.status_code == 302, r.text
                assert r.headers["location"] == f"{settings.FRONTEND_URL}/cabinet"

                set_cookie = r.headers["set-cookie"]
                assert f"{settings.SESSION_COOKIE_NAME}=" in set_cookie
                assert "HttpOnly" in set_cookie
                assert "samesite=lax" in set_cookie.lower()

                # /auth/me по куке, без Bearer
                me = await c.get(f"{API}/auth/me")
                assert me.status_code == 200, me.text
                m = me.json()
                assert m["subject_type"] == "user"
                assert m["user_id"] == DISCORD_ID
                assert m["clan_id"] == "CLAN_A"
                assert m["role"] == "officer"
                assert m["avatar_url"] == (
                    f"https://cdn.discordapp.com/avatars/{DISCORD_ID}/{PROFILE['avatar']}.png"
                )
                assert "reports:create" in m["scopes"]

                # профиль реально доехал до Discord
                assert mock.token.called and mock.profile.called
                form = parse_qs(mock.token.calls.last.request.content.decode())
                assert form["grant_type"] == ["authorization_code"]
                assert form["code"] == ["abc"]
                assert form["client_id"] == ["client-123"]
                assert form["client_secret"] == ["secret-456"]
                assert form["redirect_uri"] == [
                    "http://testserver/api/v1/auth/discord/callback"
                ]
                assert mock.profile.calls.last.request.headers["Authorization"] == \
                    f"Bearer {TOKEN_RESPONSE['access_token']}"

                # аватар сохранён в users.avatar_url (миграция 0004)
                async with AsyncSessionLocal() as s:
                    with bypass_clan_filter():
                        user = (
                            await s.execute(select(User).where(User.id == DISCORD_ID))
                        ).scalar_one()
                assert user.avatar_url == (
                    f"https://cdn.discordapp.com/avatars/{DISCORD_ID}/{PROFILE['avatar']}.png"
                )
                assert user.display_name == PROFILE["global_name"]

    run(main())


def test_callback_json_mode_returns_working_bearer(db, monkeypatch):
    async def main() -> None:
        await seed_clan("CLAN_A")
        await seed_membership("CLAN_A", role=ClanRole.MEMBER)
        enable_discord(monkeypatch)
        state = make_state(clan_id="CLAN_A")

        with discord_mock():
            async with client() as c:
                r = await c.get(
                    f"{API}/auth/discord/callback",
                    params={"code": "abc", "state": state, "response": "json"},
                )
                assert r.status_code == 200, r.text
                body = r.json()
                assert body["token_type"] == "bearer"
                assert body["expires_in"] == settings.ACCESS_TOKEN_TTL_MIN * 60
                assert body["message"] == f"Welcome, {PROFILE['global_name']}."
                assert body["me"]["user_id"] == DISCORD_ID
                assert body["me"]["clan_id"] == "CLAN_A"
                assert body["me"]["role"] == "member"

                me = await c.get(
                    f"{API}/auth/me",
                    headers={"Authorization": f"Bearer {body['access_token']}"},
                )
                assert me.status_code == 200, me.text
                assert me.json()["user_id"] == DISCORD_ID

    run(main())


def test_callback_multiple_memberships_takes_latest(db, monkeypatch):
    async def main() -> None:
        await seed_membership("CLAN_A", role=ClanRole.MEMBER)
        await seed_clan("CLAN_B")
        await seed_membership("CLAN_B", role=ClanRole.ADMIN)
        enable_discord(monkeypatch)

        with discord_mock():
            async with client() as c:
                r = await c.get(
                    f"{API}/auth/discord/callback",
                    params={"code": "abc", "state": make_state(), "response": "json"},
                )
                assert r.status_code == 200, r.text
                assert r.json()["me"]["clan_id"] == "CLAN_B"

    run(main())


def test_callback_membership_required_and_default_clan_join(db, monkeypatch):
    async def main() -> None:
        enable_discord(monkeypatch)
        state = make_state()

        # 1) нет membership и нет DEFAULT_CLAN_ID -> 403 user.not_member
        with discord_mock():
            async with client() as c:
                r = await c.get(
                    f"{API}/auth/discord/callback",
                    params={"code": "abc", "state": state, "response": "json"},
                    headers={"Accept-Language": "ru"},
                )
                assert r.status_code == 403, r.text
                body = r.json()
                assert body["error"]["code"] == "forbidden"
                assert body["error"]["message"].startswith("Вы не состоите ни в одном клане")

        # 2) redirect-режим той же ошибки -> 302 FRONTEND_URL?error=forbidden
        with discord_mock():
            async with client() as c:
                r = await c.get(
                    f"{API}/auth/discord/callback",
                    params={"code": "abc", "state": state},
                )
                assert r.status_code == 302
                assert r.headers["location"] == f"{settings.FRONTEND_URL}?error=forbidden"

        # 3) DEFAULT_CLAN_ID больше не принимает автоматически: только invite
        monkeypatch.setattr(settings, "DEFAULT_CLAN_ID", "CLAN_DEFAULT", raising=True)
        with discord_mock():
            async with client() as c:
                r = await c.get(
                    f"{API}/auth/discord/callback",
                    params={"code": "abc", "state": make_state(), "response": "json"},
                )
                assert r.status_code == 403, r.text

    run(main())


def test_callback_state_from_clan_requires_membership_there(db, monkeypatch):
    async def main() -> None:
        await seed_membership("CLAN_A", role=ClanRole.MEMBER)
        enable_discord(monkeypatch)

        # state указывает CLAN_B, юзер состоит только в CLAN_A -> 403
        with discord_mock():
            async with client() as c:
                r = await c.get(
                    f"{API}/auth/discord/callback",
                    params={"code": "abc", "state": make_state(clan_id="CLAN_B"), "response": "json"},
                    headers={"Accept-Language": "ru"},
                )
                assert r.status_code == 403, r.text
                assert r.json()["error"]["message"] == (
                    f"Пользователь {DISCORD_ID} не состоит в клане CLAN_B."
                )

    run(main())


# --------------------------------------------------------------------------- #
# GET /discord/callback — ошибки
# --------------------------------------------------------------------------- #
def test_callback_rejects_forged_and_expired_state(db, monkeypatch):
    async def main() -> None:
        enable_discord(monkeypatch)
        good = make_state(clan_id="CLAN_A")
        forged = f"{good.rsplit('.', 1)[0]}.{'0' * 64}"          # подпись подделана
        other_secret_state = good + "x"                          # мусор в подписи

        cases = [None, "", "garbage", forged, other_secret_state]
        with discord_mock() as mock:
            async with client() as c:
                for state in cases:
                    r = await c.get(
                        f"{API}/auth/discord/callback",
                        params={"code": "abc", "state": state, "response": "json"},
                        headers={"Accept-Language": "en"},
                    )
                    assert r.status_code == 401, (state, r.text)
                    assert r.json()["error"]["message"] == (
                        "OAuth sign-in could not be verified: invalid or expired state."
                    )
                assert not mock.token.called          # до Discord не дошли

        # просроченный state
        monkeypatch.setattr(settings, "DISCORD_OAUTH_STATE_TTL_SEC", -1, raising=True)
        expired = make_state(clan_id="CLAN_A")
        monkeypatch.setattr(settings, "DISCORD_OAUTH_STATE_TTL_SEC", 600, raising=True)
        with discord_mock():
            async with client() as c:
                r = await c.get(
                    f"{API}/auth/discord/callback",
                    params={"code": "abc", "state": expired, "response": "json"},
                    headers={"Accept-Language": "ru"},
                )
                assert r.status_code == 401, r.text

        # redirect-режим: 302 на фронт с error=state_invalid
        with discord_mock():
            async with client() as c:
                r = await c.get(
                    f"{API}/auth/discord/callback",
                    params={"code": "abc", "state": forged},
                    headers={"Accept-Language": "cs"},
                )
                assert r.status_code == 302
                assert r.headers["location"] == f"{settings.FRONTEND_URL}?error=state_invalid"

    run(main())


def test_callback_discord_token_error_maps_to_502(db, monkeypatch):
    async def main() -> None:
        enable_discord(monkeypatch)
        state = make_state(clan_id="CLAN_A")

        with discord_mock(token_status=400):
            async with client() as c:
                r = await c.get(
                    f"{API}/auth/discord/callback",
                    params={"code": "abc", "state": state, "response": "json"},
                    headers={"Accept-Language": "ru"},
                )
                assert r.status_code == 502, r.text
                assert r.json()["error"]["code"] == "exchange_failed"
                assert r.json()["error"]["message"] == (
                    "Discord не выдал токен доступа. Попробуйте войти ещё раз."
                )

        with discord_mock(token_status=500):
            async with client() as c:
                r = await c.get(
                    f"{API}/auth/discord/callback",
                    params={"code": "abc", "state": state},
                )
                assert r.status_code == 302
                assert r.headers["location"] == f"{settings.FRONTEND_URL}?error=exchange_failed"

    run(main())


def test_callback_discord_profile_error_maps_to_502(db, monkeypatch):
    async def main() -> None:
        enable_discord(monkeypatch)
        state = make_state(clan_id="CLAN_A")

        with discord_mock(profile_status=401):
            async with client() as c:
                r = await c.get(
                    f"{API}/auth/discord/callback",
                    params={"code": "abc", "state": state, "response": "json"},
                    headers={"Accept-Language": "en"},
                )
                assert r.status_code == 502, r.text
                assert r.json()["error"]["code"] == "profile_failed"
                assert r.json()["error"]["message"] == (
                    "Could not fetch your profile from Discord. Please try signing in again."
                )

    run(main())


def test_callback_without_code_is_exchange_failure(db, monkeypatch):
    async def main() -> None:
        enable_discord(monkeypatch)
        with discord_mock() as mock:
            async with client() as c:
                r = await c.get(
                    f"{API}/auth/discord/callback",
                    params={"state": make_state(), "response": "json"},
                )
                assert r.status_code == 502, r.text
                assert r.json()["error"]["code"] == "exchange_failed"
                assert not mock.token.called

    run(main())


def test_callback_return_to_is_open_redirect_safe(db, monkeypatch):
    async def main() -> None:
        await seed_clan("CLAN_A")
        await seed_membership("CLAN_A")
        enable_discord(monkeypatch)
        with discord_mock():
            async with client() as c:
                evil = await c.get(
                    f"{API}/auth/discord/callback",
                    params={
                        "code": "abc",
                        "state": make_state(return_to="https://evil.example/git"),
                    },
                )
                assert evil.status_code == 302
                assert evil.headers["location"] == f"{settings.FRONTEND_URL}"

                same = await c.get(
                    f"{API}/auth/discord/callback",
                    params={"code": "abc", "state": make_state(return_to=settings.FRONTEND_URL + "/codes")},
                )
                assert same.headers["location"] == f"{settings.FRONTEND_URL}/codes"

    run(main())


# --------------------------------------------------------------------------- #
# POST /logout
# --------------------------------------------------------------------------- #
def test_logout_clears_session_cookie(db, monkeypatch):
    async def main() -> None:
        await seed_clan("CLAN_A")
        await seed_membership("CLAN_A")
        enable_discord(monkeypatch)
        state = make_state(clan_id="CLAN_A")

        with discord_mock():
            async with client() as c:
                login = await c.get(
                    f"{API}/auth/discord/callback", params={"code": "abc", "state": state}
                )
                assert login.status_code == 302
                assert settings.SESSION_COOKIE_NAME in c.cookies
                assert (await c.get(f"{API}/auth/me")).status_code == 200

                out = await c.post(f"{API}/auth/logout")
                assert out.status_code == 204, out.text
                assert out.content == b""
                assert f"{settings.SESSION_COOKIE_NAME}=" in out.headers["set-cookie"]
                assert "Max-Age=0" in out.headers["set-cookie"] or "max-age=0" in out.headers["set-cookie"]

                # кука больше не аутентифицирует, Bearer не передан -> 401
                me = await c.get(f"{API}/auth/me")
                assert me.status_code == 401, me.text

    run(main())


def test_logout_without_session_is_still_204(db):
    async def main() -> None:
        async with client() as c:
            r = await c.post(f"{API}/auth/logout", headers={"Accept-Language": "cs"})
            assert r.status_code == 204, r.text

    run(main())


# --------------------------------------------------------------------------- #
# Владелец Discord-сервера: выбор сервера клана
# --------------------------------------------------------------------------- #
GUILDS = [
    {"id": "900000000000000001", "name": "SINDARIS HQ", "icon": "abc", "owner": True},
    {"id": "900000000000000002", "name": "Чужой сервер", "icon": None, "owner": False},
    {"id": "900000000000000003", "name": "Второй сервер", "icon": None, "owner": True},
]


def test_owner_picks_guild_and_becomes_clan_owner(db, monkeypatch):
    async def main() -> None:
        enable_discord(monkeypatch)
        with discord_mock(guilds=GUILDS):
            async with client() as c:
                r = await c.get(
                    f"{API}/auth/discord/callback", params={"code": "abc", "state": make_state()}
                )
                assert r.status_code == 302, r.text
                assert r.headers["location"] == f"{settings.FRONTEND_URL}?setup=guild"
                assert settings.SESSION_COOKIE_NAME not in c.cookies

                setup = await c.get(f"{API}/auth/discord/setup")
                assert setup.status_code == 200, setup.text
                body = setup.json()
                assert [g["id"] for g in body["guilds"]] == [
                    "900000000000000001", "900000000000000003",
                ]                                     # только серверы во владении
                assert body["guilds"][0]["icon_url"].endswith("/900000000000000001/abc.png")
                assert body["guilds"][0]["clan_id"] is None
                assert body["memberships"] == []

                # чужой (не во владении) сервер выбрать нельзя
                bad = await c.post(
                    f"{API}/auth/discord/setup", json={"guild_id": "900000000000000002"}
                )
                assert bad.status_code == 403

                ok = await c.post(
                    f"{API}/auth/discord/setup",
                    json={"guild_id": "900000000000000001"},
                    headers={"Accept-Language": "ru"},
                )
                assert ok.status_code == 200, ok.text
                assert ok.json()["me"]["role"] == "owner"
                assert ok.json()["me"]["clan_id"] == "900000000000000001"
                assert "SINDARIS HQ" in ok.json()["message"]

                me = await c.get(f"{API}/auth/me")
                assert me.status_code == 200
                assert me.json()["scopes"] == ["*"]

                # кука выбора стёрта — повторный выбор требует нового входа
                again = await c.get(f"{API}/auth/discord/setup")
                assert again.status_code == 401

        # повторный вход: сервер помечен как клан, членство видно
        with discord_mock(guilds=GUILDS):
            async with client() as c:
                await c.get(f"{API}/auth/discord/callback", params={"code": "abc", "state": make_state()})
                body = (await c.get(f"{API}/auth/discord/setup")).json()
                assert body["guilds"][0]["clan_id"] == "900000000000000001"
                assert body["memberships"][0]["role"] == "owner"
                ok = await c.post(f"{API}/auth/discord/setup", json={"clan_id": "900000000000000001"})
                assert ok.status_code == 200
                denied = await c.post(f"{API}/auth/discord/setup", json={"clan_id": "CLAN_X"})
                assert denied.status_code == 401        # кука уже потрачена

    run(main())


def test_owner_guild_links_existing_unlinked_clan(db, monkeypatch):
    async def main() -> None:
        enable_discord(monkeypatch)
        await seed_membership("SANDALIS", role=ClanRole.OWNER)
        with discord_mock(guilds=GUILDS[:1]):
            async with client() as c:
                await c.get(f"{API}/auth/discord/callback", params={"code": "abc", "state": make_state()})
                ok = await c.post(f"{API}/auth/discord/setup", json={"guild_id": "900000000000000001"})
                assert ok.status_code == 200, ok.text
                assert ok.json()["me"]["clan_id"] == "SANDALIS"   # данные клана сохранены
        async with AsyncSessionLocal() as s:
            clan = await s.get(Clan, "SANDALIS")
            assert clan.discord_guild_id == "900000000000000001"
            assert clan.name == "SINDARIS HQ"

    run(main())


def test_setup_requires_signed_cookie(db, monkeypatch):
    async def main() -> None:
        async with client() as c:
            r = await c.get(f"{API}/auth/discord/setup")
            assert r.status_code == 401
            assert r.json()["error"]["code"] == "setup_expired"
            c.cookies.set("sindaris_discord_setup", "forged.value")
            r = await c.post(f"{API}/auth/discord/setup", json={"guild_id": "1"})
            assert r.status_code == 401

    run(main())


# --------------------------------------------------------------------------- #
# гостевой доступ
# --------------------------------------------------------------------------- #
def test_guest_uses_tools_but_sees_no_clan_data(db, monkeypatch):
    async def main() -> None:
        monkeypatch.setattr(settings, "GUEST_ACCESS_ENABLED", False, raising=True)
        async with client() as c:
            assert (await c.post(f"{API}/auth/guest")).status_code == 403

        monkeypatch.setattr(settings, "GUEST_ACCESS_ENABLED", True, raising=True)
        monkeypatch.setattr(settings, "DEFAULT_CLAN_ID", "CLAN_A", raising=True)
        await seed_catalog_item("rifle")
        await seed_stockpile_with_stock(clan_id="CLAN_A")
        async with client() as c:
            r = await c.post(f"{API}/auth/guest", headers={"Accept-Language": "ru"})
            assert r.status_code == 200, r.text
            me = r.json()["me"]
            assert me["subject_type"] == "guest"
            assert me["clan_id"] == "__guest__"          # ни SANDALIS, ни другой клан
            assert me["scopes"] == ["catalog:read"]

            # инструменты работают
            assert (await c.get(f"{API}/items")).status_code == 200
            assert (await c.get(f"{API}/content")).status_code == 200
            assert (await c.get(f"{API}/recipes")).status_code == 200
            # данные кланов — нет
            for path in ("stockpiles", "timers", "reports", "orders", "auth/invites", "clan/settings"):
                resp = await c.get(f"{API}/{path}")
                assert resp.status_code in (403, 404), (path, resp.status_code, resp.text)
            assert (await c.post(f"{API}/stockpiles", json={"name": "X", "region": "Y"})).status_code == 403

    run(main())


# --------------------------------------------------------------------------- #
# роли Discord-сервера: снимок командира, уровни, вступление без приглашений
# --------------------------------------------------------------------------- #
ROLE_GUILD = "700000000000000001"
R_OFFICER, R_PILOT, R_OTHER = "100000000000000111", "100000000000000222", "100000000000000999"
SNAPSHOT = [
    {"id": R_OFFICER, "name": "Офицер", "color": 15158332, "position": 5},
    {"id": R_PILOT, "name": "Пилот", "color": 0, "position": 3},
]


async def link_guild(snapshot: list[dict] | None = None, levels: dict[str, str] | None = None) -> None:
    from app.models.clan_settings import ClanSettings

    await seed_clan("CLAN_R", "Roles Clan")
    async with AsyncSessionLocal() as s:
        with bypass_clan_filter():
            clan = await s.get(Clan, "CLAN_R")
            clan.discord_guild_id = ROLE_GUILD
            s.add(ClanSettings(clan_id="CLAN_R", discord_roles=snapshot or [], discord_role_map=levels or {}))
            await s.commit()


def member_mock(mock, roles: list[str], owner: bool = False) -> None:
    mock.post(f"{BASE}/oauth2/token").respond(json=TOKEN_RESPONSE)
    mock.get(f"{BASE}/users/@me").respond(json=PROFILE)
    mock.get(f"{BASE}/users/@me/guilds").respond(json=[{"id": ROLE_GUILD, "name": "Clan", "owner": owner}])
    mock.get(f"{BASE}/users/@me/guilds/{ROLE_GUILD}/member").respond(json={"roles": roles, "nick": None})


async def discord_login(c, roles: list[str]):
    with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
        member_mock(mock, roles)
        return await c.get(f"{API}/auth/discord/callback",
                           params={"code": "abc", "state": make_state(), "response": "json"})


def test_join_clan_with_discord_roles_and_level(db, monkeypatch):
    async def main() -> None:
        enable_discord(monkeypatch)
        await link_guild(SNAPSHOT, {R_OFFICER: "medium"})
        async with client() as c:
            r = await discord_login(c, [R_OTHER, R_PILOT, R_OFFICER])
            assert r.status_code == 202, r.text                  # выбор: вступить в клан
            setup = (await c.get(f"{API}/auth/discord/setup")).json()
            assert setup["guilds"] == []
            [join] = setup["joins"]
            assert join["clan_id"] == "CLAN_R" and join["level"] == "medium"
            assert [x["name"] for x in join["roles"]] == ["Офицер", "Пилот"]

            ok = await c.post(f"{API}/auth/discord/setup", json={"join_clan_id": "CLAN_R"})
            assert ok.status_code == 200, ok.text
            assert ok.json()["me"]["role"] == "officer"           # средний уровень

            # следующий вход: уже участник — сразу в терминал, уровень пересчитан
            r = await discord_login(c, [R_PILOT])
            assert r.status_code == 200, r.text
            assert r.json()["me"]["role"] == "member"             # базовый (рядовой)

    run(main())


def test_no_join_until_owner_pulls_roles(db, monkeypatch):
    async def main() -> None:
        enable_discord(monkeypatch)
        await link_guild([])                                       # бот ещё не добавлен
        async with client() as c:
            r = await discord_login(c, [R_OFFICER])
            assert r.status_code == 403
            assert r.json()["error"]["message"].startswith("You are not in any clan")

    run(main())


def test_owner_role_never_downgraded(db, monkeypatch):
    async def main() -> None:
        enable_discord(monkeypatch)
        await link_guild(SNAPSHOT)
        await seed_membership("CLAN_R", role=ClanRole.OWNER)
        async with client() as c:
            r = await discord_login(c, [R_PILOT])
            assert r.status_code == 200, r.text
            assert r.json()["me"]["role"] == "owner"

    run(main())


def test_discord_roles_owner_endpoints(db, monkeypatch):
    async def main() -> None:
        enable_discord(monkeypatch)
        monkeypatch.setattr(settings, "DISCORD_BOT_TOKEN", "bot-token", raising=True)
        await link_guild([])
        owner = {"Authorization": "Bearer " + issue_access_token(user_id="boss", clan_id="CLAN_R", role=ClanRole.OWNER)}
        admin = {"Authorization": "Bearer " + issue_access_token(user_id="adm", clan_id="CLAN_R", role=ClanRole.ADMIN)}
        with respx.mock(assert_all_mocked=False, assert_all_called=False) as mock:
            mock.get(f"{BASE}/guilds/{ROLE_GUILD}/roles").respond(json=[
                {"id": ROLE_GUILD, "name": "@everyone", "position": 0},
                {"id": R_OFFICER, "name": "Офицер", "position": 5, "color": 15158332},
                {"id": R_PILOT, "name": "Пилот", "position": 3},
                {"id": "100000000000000333", "name": "Bot role", "position": 9, "managed": True},
            ])
            mock.get(f"{BASE}/guilds/{ROLE_GUILD}/members").respond(json=[
                {"user": {"id": "555", "username": "pilot1"}, "nick": "Пилот Один", "roles": [R_PILOT]},
                {"user": {"id": "666", "username": "botty", "bot": True}, "roles": []},
            ])
            async with client() as c:
                assert (await c.get(f"{API}/clan/discord-roles", headers=admin)).status_code == 403   # только командир
                r = await c.get(f"{API}/clan/discord-roles", headers=owner)
                assert r.status_code == 200, r.text
                assert r.json()["bot_in_guild"] is True and r.json()["roles"] == []

                pulled = await c.post(f"{API}/clan/discord-roles/pull", headers=owner)
                assert pulled.status_code == 200, pulled.text
                roles = pulled.json()["roles"]["roles"]
                assert [(x["name"], x["level"]) for x in roles] == [("Офицер", "basic"), ("Пилот", "basic")]

                bad = await c.put(f"{API}/clan/discord-roles", json={"levels": {R_OFFICER: "admin"}}, headers=owner)
                assert bad.status_code == 422
                ok = await c.put(f"{API}/clan/discord-roles", json={"levels": {R_OFFICER: "high", R_PILOT: "basic"}}, headers=owner)
                assert ok.status_code == 200, ok.text
                assert [x["level"] for x in ok.json()["roles"]["roles"]] == ["high", "basic"]

                members = (await c.get(f"{API}/clan/members", headers=owner)).json()
                assert members["status"] == "ok"
                assert [(m["name"], [r["name"] for r in m["roles"]], m["level"], m["joined"]) for m in members["members"]] == [
                    ("Пилот Один", ["Пилот"], "basic", False)]

                catalog = (await c.get(f"{API}/clan/permissions", headers=owner)).json()
                assert "timers:create" in [p for g in catalog["groups"] for p in g["permissions"]]
                assert "timers:create" not in catalog["presets"]["basic"]
                assert (await c.get(f"{API}/clan/permissions", headers=admin)).status_code == 403

    run(main())


def test_custom_role_grants_exact_permissions(db, monkeypatch):
    async def main() -> None:
        enable_discord(monkeypatch)
        monkeypatch.setattr(settings, "DISCORD_BOT_TOKEN", "bot-token", raising=True)
        await link_guild(SNAPSHOT)
        owner = {"Authorization": "Bearer " + issue_access_token(user_id="boss", clan_id="CLAN_R", role=ClanRole.OWNER)}
        async with client() as c:
            bad = await c.put(f"{API}/clan/discord-roles", headers=owner,
                              json={"levels": {R_PILOT: "custom"}, "permissions": {R_PILOT: ["nuke:everything"]}})
            assert bad.status_code == 422
            ok = await c.put(f"{API}/clan/discord-roles", headers=owner, json={
                "levels": {R_PILOT: "custom"},
                "permissions": {R_PILOT: ["timers:read", "timers:create", "stockpiles:read"]},
            })
            assert ok.status_code == 200, ok.text
            pilot = next(r for r in ok.json()["roles"]["roles"] if r["id"] == R_PILOT)
            assert pilot["level"] == "custom" and pilot["permissions"] == ["stockpiles:read", "timers:create", "timers:read"]

            r = await discord_login(c, [R_PILOT])
            assert r.status_code == 202
            [join] = (await c.get(f"{API}/auth/discord/setup")).json()["joins"]
            assert join["level"] == "custom"
            me = (await c.post(f"{API}/auth/discord/setup", json={"join_clan_id": "CLAN_R"})).json()["me"]
            assert set(me["scopes"]) == {"catalog:read", "stockpiles:read", "timers:create", "timers:read"}
            # кастомная роль — ровно эти действия
            assert (await c.post(f"{API}/stockpiles", json={"name": "X", "region": "Y"})).status_code == 403
            t = await c.post(f"{API}/timers", json={"title": "Depot", "duration_seconds": 3600,
                                                     "ends_at": "2030-01-01T00:00:00Z"})
            assert t.status_code == 201, t.text

            # роль Пилот + Офицер(средний) — объединение прав
            r = await discord_login(c, [R_PILOT, R_OFFICER])
            assert r.status_code == 200, r.text

    run(main())
