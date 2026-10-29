"""Журнал чувствительных действий (audit_log). Пишется отдельной сессией после успешного
действия: запись не ломает само действие, а сбой записи только логируется."""
from __future__ import annotations

import logging
from typing import Any

from app.core.db import AsyncSessionLocal
from app.core.security import Principal
from app.core.tenancy import bind_session_to_clan
from app.models.audit import AuditEntry

log = logging.getLogger(__name__)


async def record(clan_id: str, principal: Principal, action: str, **details: Any) -> None:
    try:
        async with AsyncSessionLocal() as session:
            bind_session_to_clan(session, clan_id)
            session.add(AuditEntry(
                clan_id=clan_id, actor_id=principal.user_id,
                actor_name=(principal.display_name or principal.user_id)[:120],
                developer=principal.developer, action=action[:32],
                details={k: v for k, v in details.items() if v is not None},
            ))
            await session.commit()
    except Exception:  # noqa: BLE001
        log.warning("audit record %s failed for clan %s", action, clan_id, exc_info=True)
