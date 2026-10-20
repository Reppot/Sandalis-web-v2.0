from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from pydantic import BaseModel, ConfigDict, Field

from app.core.config import settings
from app.core.errors import UnauthorizedError
from app.core.permissions import ClanRole, has_scope, missing_scopes, scopes_for


class Principal(BaseModel):
    """Иммутабельный «кто я и что мне можно» на текущий запрос."""
    model_config = ConfigDict(frozen=True)

    subject_type: Literal["user", "clan_token", "guest"] = "user"
    user_id: str
    clan_id: str
    role: ClanRole
    scopes: frozenset[str] = Field(default_factory=frozenset)
    display_name: str | None = None
    session_id: str | None = None

    def can(self, scope: str) -> bool:
        return has_scope(self.scopes, scope)

    def missing(self, required: list[str]) -> list[str]:
        return missing_scopes(self.scopes, required)


def hash_clan_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def issue_access_token(
    *,
    user_id: str,
    clan_id: str,
    role: ClanRole,
    extra_scopes: list[str] | None = None,
    revoked_scopes: list[str] | None = None,
    display_name: str | None = None,
    ttl_minutes: int | None = None,
    guest: bool = False,
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": user_id,
        "clan_id": clan_id,
        "role": role.value,
        # кладём только дельту, а не полный набор — токен остаётся коротким
        "xsc": extra_scopes or [],
        "rsc": revoked_scopes or [],
        "name": display_name,
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(minutes=ttl_minutes or settings.ACCESS_TOKEN_TTL_MIN),
        "jti": uuid.uuid4().hex,
    }
    if guest:
        payload["gst"] = True   # гостевой просмотр: без профиля и membership
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)


def decode_access_token(token: str) -> Principal:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALG],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER,
            leeway=30,  # Render free-tier иногда плывёт по времени
            options={"require": ["exp", "sub", "iat"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError(message_key="errors.token_expired", code="token_expired") from exc
    except jwt.PyJWTError as exc:
        raise UnauthorizedError(code="invalid_token") from exc

    clan_id = payload.get("clan_id")
    if not clan_id:
        raise UnauthorizedError(message_key="errors.clan_context_missing")

    try:
        role = ClanRole(payload.get("role", ClanRole.GUEST))
    except ValueError:
        role = ClanRole.GUEST

    return Principal(
        subject_type="guest" if payload.get("gst") else "user",
        user_id=str(payload["sub"]),
        clan_id=str(clan_id),
        role=role,
        scopes=scopes_for(role, payload.get("xsc", []), payload.get("rsc", [])),
        display_name=payload.get("name"),
        session_id=payload.get("jti"),
    )
