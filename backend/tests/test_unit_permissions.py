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
