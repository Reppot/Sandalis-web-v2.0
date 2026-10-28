"""Юнит-тесты RBAC: матрица ролей, wildcard-скоупы, выпуск/декод JWT."""
from __future__ import annotations

import jwt as pyjwt
import pytest

from app.core.errors import UnauthorizedError
from app.core.permissions import ClanRole, Scopes, has_scope, missing_scopes, scopes_for
from app.core.security import decode_access_token, issue_access_token


class TestRoleMatrix:
    def test_member_can_write_orders_but_not_delete(self):
        scopes = scopes_for(ClanRole.MEMBER)
        assert has_scope(scopes, Scopes.REPORTS_CREATE)
        assert not has_scope(scopes, Scopes.REPORTS_DELETE)

    def test_officer_gets_orders_delete(self):
        assert has_scope(scopes_for(ClanRole.OFFICER), Scopes.REPORTS_DELETE)

    def test_guest_is_read_only(self):
        scopes = scopes_for(ClanRole.GUEST)
        assert has_scope(scopes, Scopes.REPORTS_READ)
        assert not has_scope(scopes, Scopes.REPORTS_CREATE)

    def test_admin_extends_officer(self):
        assert has_scope(scopes_for(ClanRole.ADMIN), Scopes.CLAN_WEBHOOK)

    def test_owner_wildcard_matches_everything(self):
        scopes = scopes_for(ClanRole.OWNER)
        assert has_scope(scopes, "clan:settings:write")
        assert has_scope(scopes, "any:thing:at:all")

    def test_extra_and_revoked(self):
        scopes = scopes_for(ClanRole.MEMBER,
                            extra=["timers:write"], revoked=["orders:write"])
        assert has_scope(scopes, "timers:write")
        assert not has_scope(scopes, "orders:write")

    def test_split_pyramid_and_legacy_scope(self):
        # смотреть пирамиду может любой участник; добавлять / править / удалять — офицер
        assert has_scope(scopes_for(ClanRole.GUEST), Scopes.PYRAMID_READ)
        assert not has_scope(scopes_for(ClanRole.MEMBER), Scopes.PYRAMID_CREATE)
        assert all(has_scope(scopes_for(ClanRole.OFFICER), s)
                   for s in (Scopes.PYRAMID_CREATE, Scopes.PYRAMID_EDIT, Scopes.PYRAMID_DELETE))
        # старое право stockpiles:pyramid в сохранённых грантах раскрывается в новые
        legacy = scopes_for(ClanRole.MEMBER, extra=["stockpiles:pyramid"])
        assert has_scope(legacy, Scopes.PYRAMID_CREATE) and has_scope(legacy, Scopes.PYRAMID_DELETE)
        assert not has_scope(scopes_for(ClanRole.OFFICER, revoked=["stockpiles:pyramid"]), Scopes.PYRAMID_EDIT)

    def test_new_scopes_keep_preset_behaviour(self):
        member, guest, officer, admin = (scopes_for(r) for r in (ClanRole.MEMBER, ClanRole.GUEST, ClanRole.OFFICER, ClanRole.ADMIN))
        assert all(has_scope(member, s) for s in (Scopes.REPORTS_ASSIGN, Scopes.REPORTS_COMMENT, Scopes.STOCKPILES_CODES,
                                                    Scopes.OPERATIONS_CREATE, Scopes.CLAN_STATS))
        assert has_scope(guest, Scopes.OPERATIONS_ATTEND) and not has_scope(guest, Scopes.STOCKPILES_CODES)
        assert has_scope(officer, Scopes.CLAN_EVERYONE) and not has_scope(member, Scopes.CLAN_EVERYONE)
        assert has_scope(admin, Scopes.CLAN_TRAINING) and has_scope(admin, Scopes.OPERATIONS_MANAGE)
        assert not has_scope(officer, Scopes.OPERATIONS_MANAGE)

    def test_namespace_wildcard(self):
        assert has_scope(["orders:*"], "orders:read")
        assert not has_scope(["orders:*"], "timers:read")

    def test_missing_scopes_collects_all(self):
        assert missing_scopes(["a:read"], ["a:read", "b:write", "c:read"]) == \
            ["b:write", "c:read"]


class TestTokens:
    def test_roundtrip(self):
        token = issue_access_token(
            user_id="u-1", clan_id="CLAN_A", role=ClanRole.OFFICER,
            display_name="Tester",
        )
        principal = decode_access_token(token)
        assert principal.user_id == "u-1"
        assert principal.clan_id == "CLAN_A"
        assert principal.role is ClanRole.OFFICER
        assert principal.can(Scopes.REPORTS_DELETE)
        assert principal.session_id is not None

    def test_expired_token_is_unauthorized(self):
        token = issue_access_token(
            user_id="u-1", clan_id="CLAN_A", role=ClanRole.MEMBER, ttl_minutes=-5,
        )
        with pytest.raises(UnauthorizedError) as err:
            decode_access_token(token)
        assert err.value.code == "token_expired"

    def test_wrong_secret_rejected(self):
        # токен, подписанный чужим секретом, не проходит верификацию сервером
        import datetime as dt

        forged = pyjwt.encode(
            {"sub": "u", "clan_id": "C", "role": "admin",
             "iss": "sandalis", "aud": "sandalis-web",
             "iat": dt.datetime.now(dt.UTC),
             "exp": dt.datetime.now(dt.UTC) + dt.timedelta(minutes=5)},
            "another-secret-that-is-long-enough-32b", algorithm="HS256",
        )
        with pytest.raises(UnauthorizedError) as err:
            decode_access_token(forged)
        assert err.value.code == "invalid_token"

    def test_token_without_clan_rejected(self):
        forged = pyjwt.encode(
            {"sub": "u", "exp": 9999999999, "iat": 1,
             "iss": "sandalis", "aud": "sandalis-web"},
            "test-secret-only-for-ci-do-not-use-in-prod", algorithm="HS256",
        )
        with pytest.raises(UnauthorizedError) as err:
            decode_access_token(forged)
        assert err.value.message_key == "errors.clan_context_missing"


def test_previous_token_generation_is_rejected():
    import jwt as _jwt
    from app.core.config import settings

    token = issue_access_token(user_id="u", clan_id="C", role=ClanRole.MEMBER)
    payload = _jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG],
                          audience=settings.JWT_AUDIENCE, issuer=settings.JWT_ISSUER)
    payload.pop("gen")                      # токен, выданный до очистки данных
    old = _jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)
    with pytest.raises(UnauthorizedError):
        decode_access_token(old)


def test_basic_level_has_only_its_preset():
    from app.services.discord_roles import access_for

    class Cs:
        discord_roles = [{"id": "1", "name": "Боец", "color": 0}, {"id": "2", "name": "Офицеры", "color": 0}]
        discord_role_map = {"2": "medium"}
        discord_role_perms: dict = {}

    basic = access_for(["1"], Cs())
    assert basic["level"] == "basic" and basic["role"] == ClanRole.MEMBER
    assert basic["permissions"] == [] and basic["extra"] == []
    # тот же набор получается из JWT: роль участника + дельта extra/revoked
    assert scopes_for(basic["role"], basic["extra"], basic["revoked"]) == set(basic["permissions"])
    # «Средний» уровень — как раньше, полный пресет офицера
    assert set(access_for(["1", "2"], Cs())["permissions"]) == set(scopes_for(ClanRole.OFFICER))
