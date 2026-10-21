"""Профиль клана для раздела «Ваш клан»: название и аватар Discord-сервера, участники, склады."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.deps import CurrentPrincipal, DbDep
from app.core.errors import PermissionDeniedError
from app.core.tenancy import bypass_clan_filter
from app.models.rbac import Clan, ClanMembership
from app.models.stockpile import Stockpile

router = APIRouter(prefix="/clan", tags=["clan"])


class ClanProfileRead(BaseModel):
    id: str
    name: str
    icon_url: str | None            # аватар Discord-сервера клана
    has_discord: bool
    members: int                    # вступили в терминал
    stockpiles: int


@router.get("/profile", response_model=ClanProfileRead, summary="Профиль клана: название, аватар сервера, участники")
async def clan_profile(principal: CurrentPrincipal, session: DbDep) -> ClanProfileRead:
    if principal.subject_type == "guest":
        raise PermissionDeniedError(message_key="errors.guest_no_clan", params={})
    with bypass_clan_filter():
        clan = await session.get(Clan, principal.clan_id)
        members = (await session.execute(
            select(func.count()).select_from(ClanMembership)
            .where(ClanMembership.clan_id == principal.clan_id, ClanMembership.is_active.is_(True))
        )).scalar_one()
        stockpiles = (await session.execute(
            select(func.count()).select_from(Stockpile).where(Stockpile.clan_id == principal.clan_id)
        )).scalar_one()
    return ClanProfileRead(
        id=principal.clan_id,
        name=clan.name if clan else principal.clan_id,
        icon_url=clan.icon_url if clan else None,
        has_discord=bool(clan and clan.discord_guild_id),
        members=members,
        stockpiles=stockpiles,
    )
