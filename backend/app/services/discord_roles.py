"""Клан и роли Discord-сервера: вступление и уровни доступа без приглашений.

* Командир (владелец Discord-сервера клана) добавляет бота клана на сервер (без прав) и
  «подтягивает» роли сервера — снимок хранится в clan_settings.discord_roles.
* Каждой роли командир назначает уровень доступа: basic (рядовой) — по умолчанию,
  medium или high. Уровень -> роль терминала: member / officer / admin.
* При входе через Discord пользователь видит кланы своих серверов, где роли уже
  подтянуты, со своими ролями на сервере — и вступает кнопкой «Вступить в терминал клана».
  Уровень = самый высокий среди его ролей; при каждом следующем входе он пересчитывается.
* Роли пользователя читаются его же токеном (scope guilds.members.read); названия ролей
  и список участников сервера отдаёт бот (DISCORD_BOT_TOKEN).
* Командира (owner) пересчёт не трогает: его роль даёт владение сервером.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Final
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.permissions import ALL_PERMISSIONS, ROLE_SCOPES, ClanRole, Scopes
from app.core.tenancy import bypass_clan_filter
from app.models.clan_settings import ClanSettings
from app.models.rbac import Clan, ClanMembership
from app.services.discord_oauth import get_http_client

LEVELS: Final[tuple[str, ...]] = ("basic", "medium", "high")       # пресеты (по возрастанию)
CUSTOM: Final[str] = "custom"
LEVEL_ROLE: Final[dict[str, ClanRole]] = {"basic": ClanRole.MEMBER, "medium": ClanRole.OFFICER, "high": ClanRole.ADMIN}
DEFAULT_LEVEL: Final[str] = "basic"


def _api(path: str) -> str:
    return f"{settings.DISCORD_API_BASE_URL.rstrip('/')}{path}"


def _bot_headers() -> dict[str, str]:
    return {"Authorization": f"Bot {settings.DISCORD_BOT_TOKEN}"}


# --------------------------------------------------------------------------- #
# Discord API
# --------------------------------------------------------------------------- #
async def fetch_member_roles(access_token: str, guild_id: str) -> list[str] | None:
    """Роли пользователя на сервере (его токен, scope guilds.members.read)."""
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


async def fetch_guild_roles(guild_id: str) -> list[dict[str, Any]] | None:
    """Роли сервера глазами бота. None — бот не настроен или его нет на сервере."""
    if not settings.DISCORD_BOT_TOKEN:
        return None
    try:
        async with get_http_client() as client:
            r = await client.get(_api(f"/guilds/{guild_id}/roles"), headers=_bot_headers())
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
        # @everyone (id = id сервера) и роли интеграций/ботов уровнями не управляются
        if str(x.get("id")) != str(guild_id) and not x.get("managed")
    ]
    return sorted(roles, key=lambda x: -x["position"])


def _member_row(m: dict[str, Any]) -> dict[str, Any] | None:
    user = m.get("user") or {}
    if user.get("bot") or not user.get("id"):
        return None
    return {
        "id": str(user["id"]),
        "name": m.get("nick") or user.get("global_name") or user.get("username") or str(user["id"]),
        "roles": [str(x) for x in m.get("roles") or []],
    }


async def fetch_members_page(
    guild_id: str, *, after: str = "0", limit: int = 100, query: str = ""
) -> tuple[str, list[dict[str, Any]], str | None]:
    """Одна страница участников сервера (бот) — список не грузится целиком, даже
    если на сервере 10 000 человек. Без query: по возрастанию id после `after`,
    курсор следующей страницы — id последнего (None — страниц больше нет).
    С query: поиск Discord по началу ника/имени, одна страница."""
    if not settings.DISCORD_BOT_TOKEN:
        return "no_bot", [], None
    try:
        async with get_http_client() as client:
            if query:
                r = await client.get(_api(f"/guilds/{guild_id}/members/search"), headers=_bot_headers(),
                                     params={"query": query, "limit": limit})
            else:
                r = await client.get(_api(f"/guilds/{guild_id}/members"), headers=_bot_headers(),
                                     params={"limit": limit, "after": after or "0"})
        if r.status_code == 403:
            return "intent_required", [], None
        if r.status_code // 100 != 2:
            return "no_bot", [], None
        page = r.json()
    except (httpx.HTTPError, ValueError):
        return "no_bot", [], None
    if not isinstance(page, list):
        return "no_bot", [], None
    rows = [row for row in map(_member_row, page) if row]
    last = str((page[-1].get("user") or {}).get("id") or "") if page else ""
    cursor = last if (not query and len(page) >= limit and last) else None
    return "ok", rows, cursor


async def fetch_member_count(guild_id: str) -> int | None:
    """Примерное число участников сервера (бот, with_counts)."""
    if not settings.DISCORD_BOT_TOKEN:
        return None
    try:
        async with get_http_client() as client:
            r = await client.get(_api(f"/guilds/{guild_id}"), headers=_bot_headers(), params={"with_counts": "true"})
        if r.status_code // 100 != 2:
            return None
        n = r.json().get("approximate_member_count")
    except (httpx.HTTPError, ValueError, AttributeError):
        return None
    return int(n) if isinstance(n, int) else None


def bot_invite_url(guild_id: str | None) -> str | None:
    if not settings.DISCORD_CLIENT_ID:
        return None
    params = {"client_id": settings.DISCORD_CLIENT_ID, "scope": "bot", "permissions": "0"}
    if guild_id:
        # сервер клана подставлен заранее, но не зафиксирован: если у аккаунта нет прав
        # на этот сервер, Discord иначе показывает пустой список и не даёт выбрать другой
        params["guild_id"] = guild_id
    return f"https://discord.com/oauth2/authorize?{urlencode(params)}"


# --------------------------------------------------------------------------- #
# уровни
# --------------------------------------------------------------------------- #
def preset_scopes(level: str) -> frozenset[str]:
    return ROLE_SCOPES[LEVEL_ROLE[level]]


def access_for(member_roles: list[str], cs: ClanSettings | None) -> dict[str, Any]:
    """Доступ участника по его ролям: пресеты дают роль терминала, кастомные роли —
    свои наборы прав. Итог = объединение прав всех ролей; без ролей — базовый пресет.
    Возвращает level (самый высокий пресет или custom), role, extra/revoked для JWT."""
    snapshot = list(cs.discord_roles) if cs else []
    role_map = dict(cs.discord_role_map or {}) if cs else {}
    perms = dict(cs.discord_role_perms or {}) if cs else {}
    known = {r["id"] for r in snapshot}
    mine = [r for r in member_roles if r in known]
    levels = [role_map.get(r, DEFAULT_LEVEL) for r in mine] or [DEFAULT_LEVEL]
    presets = [lv for lv in levels if lv in LEVELS]
    custom: set[str] = set()
    for r in mine:
        if role_map.get(r) == CUSTOM:
            custom |= {x for x in perms.get(r, []) if x in ALL_PERMISSIONS}

    if presets:
        top = max(presets, key=LEVELS.index)
        role = LEVEL_ROLE[top]
        effective = set(ROLE_SCOPES[role]) | custom
    else:                                   # только кастомные роли
        top = CUSTOM
        role = ClanRole.GUEST
        effective = custom | {Scopes.CATALOG_READ}
    base = set(ROLE_SCOPES[role])
    return {
        "level": CUSTOM if any(role_map.get(r) == CUSTOM for r in mine) else top,
        "role": role,
        "extra": sorted(effective - base),
        "revoked": sorted(base - effective),
        "permissions": sorted(effective),
    }


def level_of(member_roles: list[str], snapshot: list[dict[str, Any]], role_map: dict[str, str]) -> str:
    """Самый высокий пресет среди ролей участника (для совместимости; custom учитывает access_for)."""
    known = {r["id"] for r in snapshot}
    levels = [role_map.get(r, DEFAULT_LEVEL) for r in member_roles if r in known]
    levels = [lv for lv in levels if lv in LEVELS] or [DEFAULT_LEVEL]
    return max(levels, key=LEVELS.index)


def roles_view(member_roles: list[str], snapshot: list[dict[str, Any]], role_map: dict[str, str]) -> list[dict[str, Any]]:
    """Роли участника из снимка: имя, цвет, уровень — для экрана вступления."""
    mine = set(member_roles)
    return [{"name": r["name"], "color": r["color"], "level": role_map.get(r["id"], DEFAULT_LEVEL)}
            for r in snapshot if r["id"] in mine]


def apply_access(membership: ClanMembership, access: dict[str, Any]) -> None:
    """Записать доступ в membership (owner не трогаем)."""
    if membership.role == ClanRole.OWNER:
        return
    membership.role = access["role"]
    membership.extra_scopes = access["extra"]
    membership.revoked_scopes = access["revoked"]


async def _linked_clans(session: AsyncSession, guild_ids: list[str]):  # noqa: ANN202
    """Кланы серверов пользователя, где командир уже подтянул роли (бот добавлен)."""
    if not guild_ids:
        return []
    with bypass_clan_filter():
        rows = (
            await session.execute(
                select(Clan, ClanSettings)
                .join(ClanSettings, ClanSettings.clan_id == Clan.id)
                .where(Clan.discord_guild_id.in_(guild_ids), Clan.is_active.is_(True))
            )
        ).all()
    return [(clan, cs) for clan, cs in rows if cs.discord_roles]


async def joinable_clans(
    session: AsyncSession, *, user_id: str, access_token: str, guilds: list[Any]
) -> list[dict[str, Any]]:
    """Кланы, в которые пользователь может вступить: серверы, где он участник (но не
    владелец — для своих серверов есть выбор сервера), бот добавлен, членства ещё нет."""
    not_owned = [g.id for g in guilds if not g.owner]
    out: list[dict[str, Any]] = []
    for clan, cs in await _linked_clans(session, not_owned):
        with bypass_clan_filter():
            member = (
                await session.execute(
                    select(ClanMembership.id).where(
                        ClanMembership.clan_id == clan.id, ClanMembership.user_id == user_id,
                        ClanMembership.is_active.is_(True),
                    )
                )
            ).scalar_one_or_none()
        if member is not None:
            continue
        member_roles = await fetch_member_roles(access_token, clan.discord_guild_id) or []
        out.append({
            "clan_id": clan.id,
            "name": clan.name,
            "icon_url": clan.icon_url,
            "level": access_for(member_roles, cs)["level"],
            "discord_roles": member_roles,
            "roles": roles_view(member_roles, cs.discord_roles, cs.discord_role_map or {}),
        })
    return out


async def sync_existing_members(
    session: AsyncSession, *, user_id: str, access_token: str, guild_ids: list[str]
) -> int:
    """Пересчитать уровень уже вступивших участников по их текущим ролям Discord."""
    updated = 0
    for clan, cs in await _linked_clans(session, guild_ids):
        with bypass_clan_filter():
            membership = (
                await session.execute(
                    select(ClanMembership).where(
                        ClanMembership.clan_id == clan.id, ClanMembership.user_id == user_id,
                        ClanMembership.is_active.is_(True),
                    )
                )
            ).scalar_one_or_none()
            if membership is None or membership.role == ClanRole.OWNER:
                continue
            member_roles = await fetch_member_roles(access_token, clan.discord_guild_id)
            if member_roles is None:                 # ушёл с сервера или сбой — не трогаем
                continue
            access = access_for(member_roles, cs)
            before = (membership.role, list(membership.extra_scopes), list(membership.revoked_scopes))
            apply_access(membership, access)
            if before != (membership.role, list(membership.extra_scopes), list(membership.revoked_scopes)):
                updated += 1
            await session.flush()
    return updated


def snapshot_at() -> datetime:
    return datetime.now(UTC)
