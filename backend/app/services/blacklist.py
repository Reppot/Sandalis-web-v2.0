"""Чёрный список клана: участники (Discord ID) и роли Discord.

Кто в списке (или носит роль из списка), теряет членство в клане, не может вступить заново,
а уже выданная сессия перестаёт действовать (проверка в get_principal, кэш на CACHE_SEC).
Командира клана и вход разработчика (режим разработчика) список не затрагивает.
"""
from __future__ import annotations

import time
from typing import Any, Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import ClanRole
from app.core.tenancy import bypass_clan_filter
from app.models.clan_settings import ClanSettings
from app.models.rbac import ClanMembership

CACHE_SEC: Final[int] = 30
_cache: dict[str, tuple[float, frozenset[str]]] = {}


def user_ids(cs: ClanSettings | None) -> set[str]:
    return {str(u.get("id")) for u in (cs.blacklist_users if cs else None) or [] if u.get("id")}


def role_ids(cs: ClanSettings | None) -> set[str]:
    return {str(r) for r in (cs.blacklist_roles if cs else None) or []}


def blocks(cs: ClanSettings | None, user_id: str, discord_roles: list[str] | None) -> bool:
    """Закрыт ли клан для пользователя с такими ролями Discord."""
    return user_id in user_ids(cs) or bool(role_ids(cs) & set(discord_roles or []))


async def _settings(session: AsyncSession, clan_id: str) -> ClanSettings | None:
    with bypass_clan_filter():
        return (await session.execute(select(ClanSettings).where(ClanSettings.clan_id == clan_id))).scalar_one_or_none()


async def blocked_users(session: AsyncSession, clan_id: str) -> frozenset[str]:
    """Кому закрыт клан: из списка участников и носители ролей из списка (по ролям, запомненным
    при входе). Кэш на CACHE_SEC — проверка идёт на каждом запросе."""
    hit = _cache.get(clan_id)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    cs = await _settings(session, clan_id)
    out = set(user_ids(cs))
    roles = role_ids(cs)
    if roles:
        with bypass_clan_filter():
            rows = (await session.execute(
                select(ClanMembership.user_id, ClanMembership.discord_role_ids, ClanMembership.role)
                .where(ClanMembership.clan_id == clan_id)
            )).all()
        out |= {uid for uid, ids, role in rows if role != ClanRole.OWNER and roles & set(ids or [])}
    result = frozenset(out)
    _cache[clan_id] = (time.monotonic() + CACHE_SEC, result)
    return result


def forget(clan_id: str) -> None:
    _cache.pop(clan_id, None)


def clear_cache() -> None:
    """Сбросить процессный кеш при полной очистке состояния (например, в тестах)."""
    _cache.clear()


async def apply(session: AsyncSession, clan_id: str, cs: ClanSettings) -> int:
    """Снять членство у всех, кого закрывает список (командира — никогда). Возвращает число снятых."""
    users, roles = user_ids(cs), role_ids(cs)
    with bypass_clan_filter():
        rows = (await session.execute(
            select(ClanMembership).where(ClanMembership.clan_id == clan_id, ClanMembership.is_active.is_(True))
        )).scalars().all()
    removed = 0
    for m in rows:
        if m.role != ClanRole.OWNER and (m.user_id in users or roles & set(m.discord_role_ids or [])):
            m.is_active = False
            removed += 1
    forget(clan_id)
    return removed


def view(cs: ClanSettings | None) -> dict[str, Any]:
    snapshot = {r["id"]: r for r in (cs.discord_roles if cs else None) or []}
    return {
        "users": list((cs.blacklist_users if cs else None) or []),
        "roles": [{"id": rid, "name": snapshot.get(rid, {}).get("name") or rid, "color": snapshot.get(rid, {}).get("color", 0)}
                  for rid in (cs.blacklist_roles if cs else None) or []],
    }
