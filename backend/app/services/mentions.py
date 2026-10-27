"""Упоминания @роль в текстах сайта (заметки операций) и доставка писем в почту на сайте.

Роли — снимок ролей Discord-сервера клана (ClanSettings.discord_roles, их подтягивает командир
во «Управлении»). Кто носит роль — ClanMembership.discord_role_ids, обновляется при входе.
@everyone — весь клан. Себе письмо не отправляется.
"""
from __future__ import annotations

from typing import Any, Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clan_settings import ClanSettings
from app.models.mail import ClanMail
from app.models.rbac import ClanMembership

EVERYONE: Final[dict[str, Any]] = {"id": "everyone", "name": "everyone", "color": 0}
# @everyone в Discord — тоже «роль» с id сервера; в упоминаниях она отдельно
SKIP_NAMES: Final[frozenset[str]] = frozenset({"@everyone"})


async def clan_roles(session: AsyncSession) -> list[dict[str, Any]]:
    """Роли для подсказки «@»: @everyone + роли сервера (без системной @everyone)."""
    cs = (await session.execute(select(ClanSettings))).scalar_one_or_none()
    roles = [
        {"id": str(r["id"]), "name": str(r["name"]), "color": int(r.get("color") or 0)}
        for r in (cs.discord_roles if cs else []) or []
        if r.get("name") and r.get("name") not in SKIP_NAMES and not r.get("managed")
    ]
    return [EVERYONE, *roles]


def mentioned(text: str, roles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Роли, упомянутые в тексте как «@Название» (длинные названия проверяем первыми)."""
    low = (text or "").lower()
    found: list[dict[str, Any]] = []
    for role in sorted(roles, key=lambda r: -len(r["name"])):
        if f"@{role['name'].lower()}" in low and role not in found:
            found.append(role)
    return found


async def deliver(
    session: AsyncSession,
    *,
    clan_id: str,
    roles: list[dict[str, Any]],
    sender_id: str,
    sender_name: str,
    kind: str,
    payload: dict[str, Any],
) -> int:
    """Письмо каждому участнику, у кого есть хоть одна из ролей (или всем при @everyone)."""
    if not roles:
        return 0
    ids = {r["id"] for r in roles}
    members = (await session.execute(select(ClanMembership).where(ClanMembership.is_active.is_(True)))).scalars().all()
    recipients = [
        m.user_id for m in members
        if m.user_id != sender_id and ("everyone" in ids or ids & set(m.discord_role_ids or []))
    ]
    names = [r["name"] for r in roles]
    for uid in recipients:
        session.add(ClanMail(clan_id=clan_id, recipient_id=uid, sender_id=sender_id, sender_name=sender_name[:120], kind=kind,
                             payload={**payload, "roles": names}))
    return len(recipients)
