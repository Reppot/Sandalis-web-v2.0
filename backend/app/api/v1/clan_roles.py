"""«Роли Discord» — только командир (владелец Discord-сервера клана):
подтянуть роли сервера через бота, назначить каждой уровень доступа, посмотреть участников."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import CurrentPrincipal
from app.api.v1.reports import SettingsServiceDep, settings_router
from app.core.config import settings
from app.core.errors import AppError, PermissionDeniedError
from app.core.permissions import ClanRole
from app.core.security import Principal
from app.core.tenancy import bypass_clan_filter
from app.models.clan_settings import ClanSettings
from app.models.rbac import Clan, ClanMembership
from app.schemas.clan_settings import (
    DiscordMemberRead,
    DiscordMembersRead,
    DiscordRoleRead,
    DiscordRolesRead,
    DiscordRolesSaved,
    DiscordRolesUpdate,
)
from app.services.discord_roles import (
    DEFAULT_LEVEL,
    LEVEL_ROLE,
    bot_invite_url,
    fetch_guild_members,
    fetch_guild_roles,
    level_of,
    snapshot_at,
)

router: APIRouter = settings_router   # те же /clan/* ручки, что и настройки клана


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


async def _read(service, *, check_bot: bool = True) -> DiscordRolesRead:  # noqa: ANN001
    guild_id = await _guild_id(service)
    row = await service.get()
    live = await fetch_guild_roles(guild_id) if (guild_id and check_bot) else None
    snapshot = list(row.discord_roles) if row else []
    role_map = dict(row.discord_role_map) if row else {}
    return DiscordRolesRead(
        guild_id=guild_id,
        bot_configured=bool(settings.DISCORD_BOT_TOKEN),
        bot_in_guild=live is not None if check_bot else bool(snapshot),
        bot_invite_url=bot_invite_url(guild_id),
        synced_at=row.discord_roles_synced_at if row else None,
        roles=[DiscordRoleRead(**r, level=role_map.get(r["id"], DEFAULT_LEVEL)) for r in snapshot],
    )


@router.get("/discord-roles", response_model=DiscordRolesRead,
            summary="Роли Discord-сервера клана и уровни доступа (командир)")
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
    await service.session.commit()
    return DiscordRolesSaved(roles=await _read(service, check_bot=False),
                             message=service.t.t("roles.pulled", domain="reports", n=len(roles)))


@router.put("/discord-roles", response_model=DiscordRolesSaved,
            summary="Уровни доступа ролей: basic | medium | high (командир)")
async def update_discord_roles(payload: DiscordRolesUpdate, service: SettingsServiceDep, _: OwnerDep) -> DiscordRolesSaved:
    row = await _row(service)
    ids = {r["id"] for r in row.discord_roles or []}
    # basic — значение по умолчанию, хранить его не нужно
    row.discord_role_map = {k: v for k, v in payload.levels.items() if k in ids and v != DEFAULT_LEVEL}
    await service.session.commit()
    return DiscordRolesSaved(roles=await _read(service, check_bot=False),
                             message=service.t.t("roles.saved", domain="reports"))


@router.get("/discord-members", response_model=DiscordMembersRead,
            summary="Участники Discord-сервера клана глазами бота (командир)")
async def read_discord_members(service: SettingsServiceDep, _: OwnerDep) -> DiscordMembersRead:
    guild_id = await _guild_id(service)
    if not guild_id:
        return DiscordMembersRead(status="no_guild", members=[])
    status, members = await fetch_guild_members(guild_id)
    row = await service.get()
    snapshot = list(row.discord_roles) if row else []
    role_map = dict(row.discord_role_map) if row else {}
    names = {r["id"]: r["name"] for r in snapshot}
    with bypass_clan_filter():
        joined = {
            uid: role for uid, role in (await service.session.execute(
                select(ClanMembership.user_id, ClanMembership.role).where(
                    ClanMembership.clan_id == service.clan_id, ClanMembership.is_active.is_(True))
            )).all()
        }
    return DiscordMembersRead(
        status=status,
        members=[
            DiscordMemberRead(
                id=m["id"], name=m["name"],
                roles=[names[r] for r in m["roles"] if r in names],
                level=level_of(m["roles"], snapshot, role_map),
                joined=m["id"] in joined,
                role=joined.get(m["id"]),
            )
            for m in sorted(members, key=lambda x: x["name"].lower())
        ],
    )


__all__ = ["router", "LEVEL_ROLE"]
