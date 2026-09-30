import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any


@dataclass(frozen=True)
class ClanTokenInfo:
    token: str
    discord_id: str | None
    role: str
    username: str | None


def generate_session_token() -> str:
    return secrets.token_hex(32)


def generate_oauth_state() -> str:
    return secrets.token_urlsafe(32)


def calculate_session_expiration(ttl_minutes: int = 30) -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)


def is_session_expired(expires_at: datetime) -> bool:
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    return datetime.now(timezone.utc) >= expires_at


def parse_access_tokens_registry(
    raw_json: str,
) -> dict[str, ClanTokenInfo]:
    if not raw_json or not raw_json.strip():
        return {}

    try:
        parsed: Any = json.loads(raw_json)
    except json.JSONDecodeError:
        return {}

    if not isinstance(parsed, dict):
        return {}

    registry: dict[str, ClanTokenInfo] = {}

    for raw_token, raw_value in parsed.items():
        token = str(raw_token).strip()

        if not token:
            continue

        if isinstance(raw_value, dict):
            discord_id = raw_value.get("discord_id")
            username = raw_value.get("username")
            role = raw_value.get("role", "member")

            registry[token] = ClanTokenInfo(
                token=token,
                discord_id=(
                    str(discord_id)
                    if discord_id is not None
                    else None
                ),
                role=str(role),
                username=(
                    str(username)
                    if username is not None
                    else None
                ),
            )
            continue

        if isinstance(raw_value, (str, int)) and not isinstance(
            raw_value,
            bool,
        ):
            registry[token] = ClanTokenInfo(
                token=token,
                discord_id=str(raw_value),
                role="member",
                username=None,
            )

    return registry


def resolve_access_token(
    presented_token: str,
    registry_json: str,
    legacy_token: str = "",
) -> ClanTokenInfo | None:
    normalized = presented_token.strip()

    if not normalized:
        return None

    registry = parse_access_tokens_registry(registry_json)

    for registered_token, token_info in registry.items():
        if secrets.compare_digest(normalized, registered_token):
            return token_info

    if legacy_token and secrets.compare_digest(
        normalized,
        legacy_token,
    ):
        return ClanTokenInfo(
            token=legacy_token,
            discord_id=None,
            role="member",
            username=None,
        )

    return None