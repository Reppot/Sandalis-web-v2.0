"""«Роли Discord»: сопоставление ролей сервера клана с ролями терминала (admin+)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import PermissionChecker
from app.api.v1.reports import SettingsServiceDep, settings_router
from app.core.config import settings
from app.core.permissions import Scopes
from app.models.clan_settings import ClanSettings
from app.models.rbac import Clan
from app.schemas.clan_settings import DiscordRoleRead, DiscordRolesRead, DiscordRolesSaved, DiscordRolesUpdate
from app.services.discord_roles import bot_invite_url, fetch_guild_roles

router: APIRouter = settings_router   # те же /clan/* ручки, что и настройки клана


async def _read(service) -> DiscordRolesRead:  # noqa: ANN001
    clan = (await service.session.execute(select(Clan).where(Clan.id == service.clan_id))).scalar_one_or_none()
    guild_id = clan.discord_guild_id if clan else None
    row = await service.get()
    roles = await fetch_guild_roles(guild_id) if guild_id else None
    return DiscordRolesRead(
        guild_id=guild_id,
        bot_configured=bool(settings.DISCORD_BOT_TOKEN),
        bot_in_guild=roles is not None,
        bot_invite_url=bot_invite_url(guild_id),
        enabled=bool(row and row.discord_role_sync),
        roles=[DiscordRoleRead(**r) for r in roles or []],
        role_map=dict(row.discord_role_map) if row else {},
    )


@router.get(
    "/discord-roles",
    response_model=DiscordRolesRead,
    summary="Роли Discord-сервера клана и их сопоставление с ролями терминала (admin+)",
    dependencies=[Depends(PermissionChecker([Scopes.CLAN_SETTINGS_WRITE]))],
)
async def read_discord_roles(service: SettingsServiceDep) -> DiscordRolesRead:
    return await _read(service)


@router.put(
    "/discord-roles",
    response_model=DiscordRolesSaved,
    summary="Сохранить сопоставление ролей Discord (admin+)",
    dependencies=[Depends(PermissionChecker([Scopes.CLAN_SETTINGS_WRITE]))],
)
async def update_discord_roles(payload: DiscordRolesUpdate, service: SettingsServiceDep) -> DiscordRolesSaved:
    row = await service.get()
    if row is None:
        row = ClanSettings()
        service.session.add(row)
    row.discord_role_sync = payload.enabled
    row.discord_role_map = dict(payload.role_map)
    await service.session.commit()
    return DiscordRolesSaved(roles=await _read(service), message=service.t.t("settings.roles_saved", domain="reports"))
