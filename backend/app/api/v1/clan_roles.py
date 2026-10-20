"""Вкладка «Управление» — только командир (владелец Discord-сервера клана):
участники клана с ролями, роли сервера с уровнями доступа и кастомными правами."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api.deps import CurrentPrincipal
from app.api.v1.reports import SettingsServiceDep, settings_router
from app.core.config import settings
from app.core.errors import AppError, PermissionDeniedError
from app.core.permissions import ALL_PERMISSIONS, PERMISSION_GROUPS, ClanRole, scopes_for
from app.core.security import Principal
from app.core.tenancy import bypass_clan_filter
from app.models.clan_settings import ClanSettings
from app.models.rbac import Clan, ClanMembership, User
from app.schemas.clan_settings import (
    DiscordMemberRead,
    DiscordMembersRead,
    DiscordRoleRead,
    DiscordRolesRead,
    DiscordRolesSaved,
    DiscordRolesUpdate,
    MemberRoleRead,
    PermissionCatalogRead,
    PermissionGroupRead,
)
from app.services.discord_roles import (
    CUSTOM,
    DEFAULT_LEVEL,
    LEVELS,
    access_for,
    bot_invite_url,
    fetch_member_count,
    fetch_members_page,
    fetch_guild_roles,
    preset_scopes,
    snapshot_at,
)

router: APIRouter = settings_router   # те же /clan/* ручки, что и настройки клана

ROLE_LEVEL = {ClanRole.MEMBER: "basic", ClanRole.OFFICER: "medium", ClanRole.ADMIN: "high", ClanRole.OWNER: "owner",
              ClanRole.GUEST: "guest"}


def owner_only(principal: CurrentPrincipal) -> Principal:
    if principal.subject_type != "user" or principal.role != ClanRole.OWNER:
        raise PermissionDeniedError(message_key="roles.owner_only", domain="reports", params={})
    return principal


OwnerDep = Annotated[Principal, Depends(owner_only)]


async def _guild_id(service) -> str | None:  # noqa: ANN001
    return (await service.session.execute(select(Clan.discord_guild_id).where(Clan.id == service.clan_id))).scalar_one_or_none()


async def _row(service) -> ClanSettings:  # noqa: ANN001
    row = await service.get()
    if row is None:
        row = ClanSettings()
        service.session.add(row)
    return row


def _role_read(r: dict, row: ClanSettings | None) -> DiscordRoleRead:
    level = (row.discord_role_map or {}).get(r["id"], DEFAULT_LEVEL) if row else DEFAULT_LEVEL
    perms = (row.discord_role_perms or {}).get(r["id"], []) if (row and level == CUSTOM) else sorted(preset_scopes(level))
    return DiscordRoleRead(**r, level=level, permissions=sorted(p for p in perms if p in ALL_PERMISSIONS))


async def _read(service, *, check_bot: bool = True) -> DiscordRolesRead:  # noqa: ANN001
    guild_id = await _guild_id(service)
    row = await service.get()
    live = await fetch_guild_roles(guild_id) if (guild_id and check_bot) else None
    snapshot = list(row.discord_roles) if row else []
    return DiscordRolesRead(
        guild_id=guild_id,
        bot_configured=bool(settings.DISCORD_BOT_TOKEN),
        bot_in_guild=live is not None if check_bot else bool(snapshot),
        bot_invite_url=bot_invite_url(guild_id),
        synced_at=row.discord_roles_synced_at if row else None,
        roles=[_role_read(r, row) for r in snapshot],
    )


@router.get("/permissions", response_model=PermissionCatalogRead,
            summary="Все действия сайта и состав пресетов уровней (командир)")
async def read_permission_catalog(_: OwnerDep) -> PermissionCatalogRead:
    return PermissionCatalogRead(
        groups=[PermissionGroupRead(key=k, permissions=list(v)) for k, v in PERMISSION_GROUPS],
        presets={lv: sorted(preset_scopes(lv) & ALL_PERMISSIONS) for lv in LEVELS},
    )


@router.get("/discord-roles", response_model=DiscordRolesRead,
            summary="Роли Discord-сервера клана: уровни и права (командир)")
async def read_discord_roles(service: SettingsServiceDep, _: OwnerDep) -> DiscordRolesRead:
    return await _read(service)


@router.post("/discord-roles/pull", response_model=DiscordRolesSaved,
             summary="Подтянуть роли сервера через бота (командир)")
async def pull_discord_roles(service: SettingsServiceDep, _: OwnerDep) -> DiscordRolesSaved:
    guild_id = await _guild_id(service)
    roles = await fetch_guild_roles(guild_id) if guild_id else None
    if roles is None:
        raise AppError(message_key="roles.bot_missing", domain="reports", code="bot_missing",
                       status_code=409, params={})
    row = await _row(service)
    row.discord_roles = roles
    row.discord_roles_synced_at = snapshot_at()
    ids = {r["id"] for r in roles}
    row.discord_role_map = {k: v for k, v in (row.discord_role_map or {}).items() if k in ids}
    row.discord_role_perms = {k: v for k, v in (row.discord_role_perms or {}).items() if k in ids}
    await service.session.commit()
    return DiscordRolesSaved(roles=await _read(service, check_bot=False),
                             message=service.t.t("roles.pulled", domain="reports", n=len(roles)))


@router.put("/discord-roles", response_model=DiscordRolesSaved,
            summary="Уровни ролей: basic | medium | high | custom (+ права custom) (командир)")
async def update_discord_roles(payload: DiscordRolesUpdate, service: SettingsServiceDep, _: OwnerDep) -> DiscordRolesSaved:
    unknown = {p for perms in payload.permissions.values() for p in perms} - ALL_PERMISSIONS
    if unknown:
        raise AppError(message_key="roles.unknown_permission", domain="reports", code="validation_error",
                       status_code=422, params={"permissions": ", ".join(sorted(unknown))})
    row = await _row(service)
    ids = {r["id"] for r in row.discord_roles or []}
    # basic — значение по умолчанию, хранить его не нужно
    row.discord_role_map = {k: v for k, v in payload.levels.items() if k in ids and v != DEFAULT_LEVEL}
    row.discord_role_perms = {
        k: sorted(set(payload.permissions.get(k, [])))
        for k, v in row.discord_role_map.items() if v == CUSTOM
    }
    await service.session.commit()
    return DiscordRolesSaved(roles=await _read(service, check_bot=False),
                             message=service.t.t("roles.saved", domain="reports"))


@router.get("/members", response_model=DiscordMembersRead,
            summary="Участники клана постранично: сервер Discord (бот) + вступившие в терминал (командир)")
async def read_members(
    service: SettingsServiceDep,
    _: OwnerDep,
    after: Annotated[str, Query(max_length=24, pattern=r"^\d*$")] = "",
    limit: Annotated[int, Query(ge=10, le=500)] = 100,
    q: Annotated[str, Query(max_length=64)] = "",
) -> DiscordMembersRead:
    query = q.strip()
    guild_id = await _guild_id(service)
    if guild_id:
        status, discord, next_after = await fetch_members_page(guild_id, after=after, limit=limit, query=query)
    else:
        status, discord, next_after = "no_guild", [], None
    total = await fetch_member_count(guild_id) if guild_id and not after and not query and status == "ok" else None
    row = await service.get()
    snapshot = list(row.discord_roles) if row else []
    by_id = {r["id"]: r for r in snapshot}
    with bypass_clan_filter():
        joined = {
            m.user_id: (m, name) for m, name in (await service.session.execute(
                select(ClanMembership, User.display_name)
                .join(User, User.id == ClanMembership.user_id)
                .where(ClanMembership.clan_id == service.clan_id, ClanMembership.is_active.is_(True))
            )).all()
        }
    joined_total = len(joined)

    def terminal_perms(m: ClanMembership) -> list[str]:
        return ["*"] if m.role == ClanRole.OWNER else sorted(scopes_for(m.role, m.extra_scopes, m.revoked_scopes) & ALL_PERMISSIONS)

    members: list[DiscordMemberRead] = []
    for d in discord:
        access = access_for(d["roles"], row)
        m, _name = joined.pop(d["id"], (None, None))
        members.append(DiscordMemberRead(
            id=d["id"], name=d["name"],
            roles=[MemberRoleRead(name=by_id[r]["name"], color=by_id[r]["color"]) for r in d["roles"] if r in by_id],
            level="owner" if (m and m.role == ClanRole.OWNER) else access["level"],
            in_discord=True, joined=m is not None, role=m.role.value if m else None,
            permissions=terminal_perms(m) if m else access["permissions"],
        ))

    # вступили, но бот их не видит (ушли с сервера / нет intent). Список Discord идёт по
    # возрастанию id, поэтому «ушедший» попадает на страницу, в чей диапазон id входит.
    def belongs_here(uid: str, name: str | None) -> bool:
        if status != "ok":
            return not after and not query          # бот недоступен — все вступившие на первой странице
        if query:
            return query.lower() in (name or uid).lower()
        if not uid.isdigit():
            return next_after is None
        return int(uid) > int(after or 0) and (next_after is None or int(uid) <= int(next_after))

    for uid, (m, name) in joined.items():
        if not belongs_here(uid, name):
            continue
        members.append(DiscordMemberRead(
            id=uid, name=name or uid, roles=[], level=ROLE_LEVEL.get(m.role, CUSTOM) if not (m.extra_scopes or m.revoked_scopes) else CUSTOM,
            in_discord=False, joined=True, role=m.role.value, permissions=terminal_perms(m),
        ))
    order = {"owner": 0, "high": 1, "medium": 2, CUSTOM: 3, "basic": 4, "guest": 5}
    members.sort(key=lambda x: (not x.joined, order.get(x.level, 9), x.name.lower()))
    return DiscordMembersRead(
        status=status, members=members, next_after=next_after, total=total, joined_total=joined_total,
    )
