"""Discord OAuth2 (authorization code + scope=identify guilds).

Stateless-подход v2.0: state не хранится в таблице сессий, а подписывается
HMAC-SHA256 на JWT_SECRET и несёт собственный `exp` (DISCORD_OAUTH_STATE_TTL_SEC).
Поэтому callback можно отвечать 302 без обращения к БД, а «поддельный»,
перепутанный между кланами или просроченный state отбрасывается до любых
сетевых вызовов к Discord.

Все ошибки — AppError с message_key из домена `auth` (никакого хардкода текста).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx

from app.core.config import settings
from app.core.errors import AppError, UnauthorizedError
from app.schemas.auth import DiscordGuild, DiscordTokenResponse, DiscordUserProfile

DOMAIN = "auth"
STATE_SEP = "."
_STATE_MAX_SKEW_SEC = 0


# --------------------------------------------------------------------------- #
# http
# --------------------------------------------------------------------------- #
def get_http_client() -> httpx.AsyncClient:
    """Фабрика клиента. Вынесена наружу, чтобы тесты могли её подменить
    (monkeypatch) вместо respx — и чтобы таймаут жил в одном месте."""
    return httpx.AsyncClient(timeout=10)


def _auth_error(message_key: str, code: str) -> AppError:
    return AppError(
        message_key=message_key,
        domain=DOMAIN,
        code=code,
        status_code=502,          # upstream Discord недоступен/отказал
        params={},
    )


# --------------------------------------------------------------------------- #
# signed state
# --------------------------------------------------------------------------- #
@dataclass(frozen=True, slots=True)
class OAuthState:
    """Что мы достаём из подписанного state перед выпуском JWT."""

    clan_id: str | None = None
    return_to: str | None = None
    nonce: str = ""
    invite: str | None = None


def _sign(raw: str) -> str:
    key = settings.JWT_SECRET.encode("utf-8")
    return hmac.new(key, raw.encode("utf-8"), hashlib.sha256).hexdigest()


def _encode(body: dict[str, Any]) -> str:
    blob = json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(blob).decode("ascii").rstrip("=")


def _decode(raw: str) -> dict[str, Any]:
    padded = raw + "=" * (-len(raw) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        raise UnauthorizedError(
            message_key="discord.state_invalid", domain=DOMAIN, code="state_invalid"
        ) from None
    return payload if isinstance(payload, dict) else {}


def make_state(
    clan_id: str | None = None, return_to: str | None = None, invite: str | None = None
) -> str:
    """`<base64url(payload)>.<hmac-sha256>`; nonce -> уникальность, exp -> TTL."""
    now = int(time.time())
    body: dict[str, Any] = {
        "clan_id": clan_id or None,
        "return_to": return_to or None,
        "nonce": secrets.token_urlsafe(16),
        "iat": now,
        "exp": now + settings.DISCORD_OAUTH_STATE_TTL_SEC + _STATE_MAX_SKEW_SEC,
    }
    if invite:
        body["invite"] = invite
    raw = _encode(body)
    return f"{raw}{STATE_SEP}{_sign(raw)}"


def seal(body: dict[str, Any], ttl_sec: int) -> str:
    """Подписанный самодостаточный блоб (кука выбора сервера) с exp."""
    raw = _encode({**body, "exp": int(time.time()) + ttl_sec})
    return f"{raw}{STATE_SEP}{_sign(raw)}"


def unseal(value: str | None) -> dict[str, Any] | None:
    """None при любой проблеме: подпись, формат, срок."""
    if not value or STATE_SEP not in value:
        return None
    raw, _, signature = value.rpartition(STATE_SEP)
    if not raw or not hmac.compare_digest(_sign(raw), signature):
        return None
    try:
        body = _decode(raw)
    except AppError:
        return None
    exp = body.get("exp")
    if not isinstance(exp, int) or exp < int(time.time()):
        return None
    return body


def verify_state(state: str | None) -> OAuthState:
    """Fail-closed: любая проблема -> 401 discord.state_invalid (локализовано)."""
    invalid = UnauthorizedError(
        message_key="discord.state_invalid", domain=DOMAIN, code="state_invalid"
    )
    if not state or STATE_SEP not in state:
        raise invalid

    raw, _, signature = state.rpartition(STATE_SEP)
    if not raw or not signature or not hmac.compare_digest(_sign(raw), signature):
        raise invalid

    body = _decode(raw)
    exp = body.get("exp")
    if not isinstance(exp, int) or exp < int(time.time()):
        raise invalid

    nonce = body.get("nonce")
    if not isinstance(nonce, str) or not nonce:
        raise invalid

    clan_id = body.get("clan_id")
    return_to = body.get("return_to")
    invite = body.get("invite")
    return OAuthState(
        clan_id=clan_id if isinstance(clan_id, str) and clan_id else None,
        return_to=return_to if isinstance(return_to, str) and return_to else None,
        nonce=nonce,
        invite=invite if isinstance(invite, str) and invite else None,
    )


# --------------------------------------------------------------------------- #
# Discord endpoints
# --------------------------------------------------------------------------- #
def build_authorize_url(state: str) -> str:
    """Discord OAuth2 authorize: response_type=code, scope=identify guilds
    (guilds — чтобы найти серверы, которыми пользователь владеет)."""
    params = {
        "client_id": settings.DISCORD_CLIENT_ID,
        "redirect_uri": settings.DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope": "identify guilds guilds.members.read",
        "state": state,
        "prompt": "consent",
    }
    return f"{settings.DISCORD_AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code(code: str) -> DiscordTokenResponse:
    """Authorization code -> access token. Не-2xx -> 502 discord.exchange_failed."""
    url = f"{settings.DISCORD_API_BASE_URL.rstrip('/')}/oauth2/token"
    async with get_http_client() as client:
        response = await client.post(
            url,
            data={
                "client_id": settings.DISCORD_CLIENT_ID,
                "client_secret": settings.DISCORD_CLIENT_SECRET,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.DISCORD_REDIRECT_URI,
            },
            headers={"Accept": "application/json"},
        )
        if response.status_code // 100 != 2:
            raise _auth_error("discord.exchange_failed", "exchange_failed")
        payload = response.json()

    try:
        return DiscordTokenResponse.model_validate(payload)
    except ValueError as exc:
        raise _auth_error("discord.exchange_failed", "exchange_failed") from exc


async def fetch_profile(access_token: str) -> DiscordUserProfile:
    """access token -> /users/@me. Не-2xx -> 502 discord.profile_failed."""
    url = f"{settings.DISCORD_API_BASE_URL.rstrip('/')}/users/@me"
    async with get_http_client() as client:
        response = await client.get(
            url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            },
        )
        if response.status_code // 100 != 2:
            raise _auth_error("discord.profile_failed", "profile_failed")
        payload = response.json()

    try:
        return DiscordUserProfile.model_validate(payload)
    except ValueError as exc:
        raise _auth_error("discord.profile_failed", "profile_failed") from exc


async def fetch_user_guilds(access_token: str) -> list[DiscordGuild]:
    """Все серверы пользователя (scope guilds). Сбой Discord не роняет вход:
    без списка не будет выбора сервера и синхронизации ролей."""
    url = f"{settings.DISCORD_API_BASE_URL.rstrip('/')}/users/@me/guilds"
    try:
        async with get_http_client() as client:
            response = await client.get(
                url,
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            )
        if response.status_code // 100 != 2:
            return []
        payload = response.json()
    except (httpx.HTTPError, ValueError):
        return []
    if not isinstance(payload, list):
        return []
    guilds: list[DiscordGuild] = []
    for item in payload:
        try:
            guilds.append(DiscordGuild.model_validate(item))
        except ValueError:
            continue
    return guilds


def owned_guilds(guilds: list[DiscordGuild]) -> list[DiscordGuild]:
    """Серверы во владении — для выбора сервера клана."""
    return [g for g in guilds if g.owner][:25]   # кука выбора — не больше пары килобайт


async def fetch_owned_guilds(access_token: str) -> list[DiscordGuild]:
    return owned_guilds(await fetch_user_guilds(access_token))


def avatar_url(profile: DiscordUserProfile) -> str | None:
    """CDN-ссылка на аватар; None, если у юзера дефолтный (hash пустой)."""
    if not profile.avatar:
        return None
    base = "https://cdn.discordapp.com/avatars"
    return f"{base}/{profile.id}/{profile.avatar}.png"


# --------------------------------------------------------------------------- #
# redirect hygiene
# --------------------------------------------------------------------------- #
def safe_return_to(return_to: str | None, base_url: str | None = None) -> str:
    """Открытый редирект — классика OAuth. Разрешаем только относительный путь
    либо абсолютный URL с тем же origin, что FRONTEND_URL."""
    base = (base_url or settings.FRONTEND_URL).rstrip("/")
    if not return_to:
        return base

    candidate = return_to.strip()
    if candidate.startswith("/") and not candidate.startswith("//"):
        return f"{base}{candidate}"

    try:
        from urllib.parse import urlsplit

        target, origin = urlsplit(candidate), urlsplit(base)
    except ValueError:
        return base
    if target.scheme in ("http", "https") and (
        target.netloc == origin.netloc and target.scheme == origin.scheme
    ):
        return candidate
    return base


def setup_redirect_url(base_url: str | None = None) -> str:
    """FRONTEND_URL?setup=guild — фронт покажет выбор сервера клана."""
    base = (base_url or settings.FRONTEND_URL).rstrip("/")
    return f"{base}?{urlencode({'setup': 'guild'})}"


def error_redirect_url(code: str, base_url: str | None = None) -> str:
    """FRONTEND_URL?error=<code> — фронт сам покажет локализованный текст."""
    base = (base_url or settings.FRONTEND_URL).rstrip("/")
    return f"{base}?{urlencode({'error': code})}"
