from dataclasses import dataclass
from typing import Mapping

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    ClanTokenInfo,
    calculate_session_expiration,
    generate_session_token,
    resolve_access_token,
)
from app.models.session import Session
from app.models.user import User
from app.services.errors import AuthenticationServiceError


@dataclass(frozen=True)
class AuthenticatedSession:
    session: Session
    user: User


def _read_string(
    payload: Mapping[str, object],
    key: str,
    default: str = "",
) -> str:
    value = payload.get(key)

    if value is None:
        return default

    return str(value)


class AuthService:
    async def login_with_clan_token(
        self,
        db: AsyncSession,
        presented_token: str,
    ) -> AuthenticatedSession:
        token_info = resolve_access_token(
            presented_token=presented_token,
            registry_json=settings.access_tokens_json,
            legacy_token=settings.access_token,
        )

        if token_info is None:
            raise AuthenticationServiceError(
                "Invalid clan access token",
            )

        user = await self._get_or_create_token_user(
            db=db,
            token_info=token_info,
        )

        return await self._create_session(
            db=db,
            user=user,
            role=token_info.role,
        )

    async def login_with_discord_code(
        self,
        db: AsyncSession,
        code: str,
    ) -> AuthenticatedSession:
        if not settings.discord_client_id:
            raise AuthenticationServiceError(
                "Discord OAuth is not configured",
            )

        async with httpx.AsyncClient(
            base_url=settings.discord_api_base_url,
            timeout=15.0,
        ) as client:
            token_response = await client.post(
                "/oauth2/token",
                data={
                    "client_id": settings.discord_client_id,
                    "client_secret": settings.discord_client_secret,
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": settings.discord_redirect_uri,
                },
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )

            if token_response.status_code >= 400:
                raise AuthenticationServiceError(
                    "Discord authorization code exchange failed",
                )

            token_payload = token_response.json()

            if not isinstance(token_payload, dict):
                raise AuthenticationServiceError(
                    "Discord returned an invalid token payload",
                )

            discord_access_token = token_payload.get("access_token")

            if not isinstance(discord_access_token, str):
                raise AuthenticationServiceError(
                    "Discord access token is missing",
                )

            user_response = await client.get(
                "/users/@me",
                headers={
                    "Authorization": (
                        f"Bearer {discord_access_token}"
                    ),
                },
            )

            if user_response.status_code >= 400:
                raise AuthenticationServiceError(
                    "Discord profile request failed",
                )

            profile_payload = user_response.json()

            if not isinstance(profile_payload, dict):
                raise AuthenticationServiceError(
                    "Discord returned an invalid profile payload",
                )

        discord_id = _read_string(profile_payload, "id")

        if not discord_id:
            raise AuthenticationServiceError(
                "Discord profile does not contain an id",
            )

        username = _read_string(
            profile_payload,
            "global_name",
        ) or _read_string(
            profile_payload,
            "username",
            default="Discord user",
        )

        discriminator = _read_string(
            profile_payload,
            "discriminator",
            default="0",
        )

        avatar_hash = profile_payload.get("avatar")
        avatar_url = None

        if isinstance(avatar_hash, str) and avatar_hash:
            avatar_url = (
                "https://cdn.discordapp.com/avatars/"
                f"{discord_id}/{avatar_hash}.png"
            )

        user = await self._get_or_create_discord_user(
            db=db,
            discord_id=discord_id,
            username=username,
            avatar_url=avatar_url,
        )

        return await self._create_session(
            db=db,
            user=user,
            role=user.role,
        )

    async def _get_or_create_token_user(
        self,
        db: AsyncSession,
        token_info: ClanTokenInfo,
    ) -> User:
        user: User | None = None

        if token_info.discord_id:
            result = await db.execute(
                select(User).where(
                    User.discord_id == token_info.discord_id,
                )
            )
            user = result.scalar_one_or_none()

        username = token_info.username or "Clan member"

        if user is None:
            user = User(
                discord_id=token_info.discord_id,
                username=username,
                role=token_info.role,
            )
            db.add(user)
        else:
            user.username = username
            user.role = token_info.role

        await db.flush()
        return user

    async def _get_or_create_discord_user(
        self,
        db: AsyncSession,
        discord_id: str,
        username: str,
        avatar_url: str | None,
    ) -> User:
        result = await db.execute(
            select(User).where(User.discord_id == discord_id)
        )

        user = result.scalar_one_or_none()

        if user is None:
            user = User(
                discord_id=discord_id,
                username=username,
                avatar_url=avatar_url,
                role="member",
            )
            db.add(user)
        else:
            user.username = username
            user.avatar_url = avatar_url

        await db.flush()
        return user

    async def _create_session(
        self,
        db: AsyncSession,
        user: User,
        role: str,
    ) -> AuthenticatedSession:
        session = Session(
            session_token=generate_session_token(),
            user=user,
            role=role,
            expires_at=calculate_session_expiration(
                settings.session_ttl_minutes,
            ),
        )

        db.add(session)
        await db.flush()

        return AuthenticatedSession(
            session=session,
            user=user,
        )


auth_service = AuthService()