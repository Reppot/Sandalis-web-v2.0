"""Роли терминала по ролям Discord-сервера клана.

* Админ клана сопоставляет роли сервера с ролями терминала (clan_settings.discord_role_map).
* При каждом входе через Discord (scope guilds.members.read) для кланов, привязанных к
  серверам пользователя, читаются его роли на сервере и выдаётся самая старшая
  сопоставленная роль: участник сервера попадает в клан без invite-ссылки, а смена
  роли в Discord доходит до терминала при следующем входе.
* Названия ролей Discord отдаёт только боту, поэтому для экрана сопоставления нужен
  DISCORD_BOT_TOKEN и бот на сервере (без каких-либо прав).
* Командира (owner) синхронизация не трогает: его роль даёт владение сервером.
"""
from __future__ import annotations

from typing import Final
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.permissions import ClanRole
from app.core.tenancy import bypass_clan_filter
from app.models.clan_settings import ClanSettings
from app.models.rbac import Clan, ClanMembership
from app.services.discord_oauth import get_http_client

SYNCABLE: Final[dict[str, ClanRole]] = {
    r.value: r for r in (ClanRole.GUEST, ClanRole.MEMBER, ClanRole.OFFICER, ClanRole.ADMIN)
}
RANK: Final[dict[ClanRole, int]] = {
    ClanRole.GUEST: 0, ClanRole.MEMBER: 1, ClanRole.OFFICER: 2, ClanRole.ADMIN: 3, ClanRole.OWNER: 4,
}


def _api(path: str) -> str:
    return f"{settings.DISCORD_API_BASE_URL.rstrip('/')}{path}"


async def fetch_member_roles(access_token: str, guild_id: str) -> list[str] | None:
    """Роли пользователя на сервере (scope guilds.members.read). None — не участник/сбой."""
    try:
        async with get_http_client() as client:
            r = await client.get(_api(f"/users/@me/guilds/{guild_id}/member"),
                                 headers={"Authorization": f"Bearer {access_token}"})
        if r.status_code // 100 != 2:
            return None
        roles = r.json().get("roles")
    except (httpx.HTTPError, ValueError, AttributeError):
        return None
    return [str(x) for x in roles] if isinstance(roles, list) else None


async def fetch_guild_roles(guild_id: str) -> list[dict] | None:
    """Роли сервера глазами бота. None — бот не настроен или его нет на сервере."""
    if not settings.DISCORD_BOT_TOKEN:
        return None
    try:
        async with get_http_client() as client:
            r = await client.get(_api(f"/guilds/{guild_id}/roles"),
                                 headers={"Authorization": f"Bot {settings.DISCORD_BOT_TOKEN}"})
        if r.status_code // 100 != 2:
            return None
        data = r.json()
    except (httpx.HTTPError, ValueError):
        return None
    if not isinstance(data, list):
        return None
    roles = [
        {"id": str(x["id"]), "name": str(x.get("name", "")), "color": int(x.get("color") or 0),
         "position": int(x.get("position") or 0)}
        for x in data
        # @everyone (id = id сервера) и роли интеграций/ботов сопоставлять бессмысленно
        if str(x.get("id")) != str(guild_id) and not x.get("managed")
    ]
    return sorted(roles, key=lambda x: -x["position"])


def bot_invite_url(guild_id: str | None) -> str | None:
    if not settings.DISCORD_CLIENT_ID:
        return None
    params = {"client_id": settings.DISCORD_CLIENT_ID, "scope": "bot", "permissions": "0"}
    if guild_id:
        params |= {"guild_id": guild_id, "disable_guild_select": "true"}
    return f"https://discord.com/oauth2/authorize?{urlencode(params)}"


def best_role(member_roles: list[str], role_map: dict[str, str]) -> ClanRole | None:
    mapped = [SYNCABLE[role_map[r]] for r in member_roles if role_map.get(r) in SYNCABLE]
    return max(mapped, key=RANK.__getitem__) if mapped else None


async def sync_member_roles(
    session: AsyncSession, upsert_identity, *, user_id: str, display_name: str,  # noqa: ANN001
    access_token: str, guild_ids: list[str],
) -> int:
    """Выдать/обновить membership по ролям Discord во всех кланах серверов пользователя.
    upsert_identity — AuthService._upsert_identity (создаёт клан/юзера/membership)."""
    if not guild_ids:
        return 0
    with bypass_clan_filter():
        rows = (
            await session.execute(
                select(Clan.id, Clan.discord_guild_id, ClanSettings.discord_role_map)
                .join(ClanSettings, ClanSettings.clan_id == Clan.id)
                .where(Clan.discord_guild_id.in_(guild_ids), ClanSettings.discord_role_sync.is_(True))
            )
        ).all()
    synced = 0
    for clan_id, guild_id, role_map in rows:
        member_roles = await fetch_member_roles(access_token, guild_id)
        role = best_role(member_roles or [], role_map or {})
        if role is None:
            continue
        membership, _ = await upsert_identity(
            clan_id=clan_id, user_id=user_id, display_name=display_name, role=role,
        )
        with bypass_clan_filter():
            membership.is_active = True
            if membership.role != ClanRole.OWNER:
                membership.role = role
            await session.flush()
        synced += 1
    return synced
