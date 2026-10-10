from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Sequence

from sqlalchemy import select

from app.core.errors import NotFoundError
from app.models.code import ClanInviteCode
from app.schemas.code import InviteCodeCreate
from app.services.base import ClanScopedService

DOMAIN = "auth"   # сообщения invite-флоу живут в домене auth

# без визуально двусмысленных символов (0/O, 1/I/L)
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def generate_invite_code(length: int = 8) -> str:
    return "INV-" + "".join(secrets.choice(_ALPHABET) for _ in range(length))


class InviteService(ClanScopedService):
    """Управление пригласительными кодами клана (admin/officer)."""

    async def list_invites(
        self, *, include_revoked: bool = False, limit: int = 50, offset: int = 0
    ) -> tuple[Sequence[ClanInviteCode], int]:
        stmt = self._scoped(select(ClanInviteCode), ClanInviteCode)
        if not include_revoked:
            stmt = stmt.where(ClanInviteCode.revoked_at.is_(None))
        total = await self._count(stmt)
        rows = (
            await self.session.execute(
                stmt.order_by(ClanInviteCode.created_at.desc())
                .limit(min(limit, 200))
                .offset(offset)
            )
        ).scalars().all()
        return rows, total

    async def create_invite(self, payload: InviteCodeCreate) -> tuple[ClanInviteCode, str]:
        for _ in range(3):  # код короткий — страхуемся от редкой коллизии
            code = generate_invite_code()
            exists = (
                await self.session.execute(
                    select(ClanInviteCode.id).where(ClanInviteCode.code == code)
                )
            ).scalar_one_or_none()
            if exists is None:
                break
        else:  # pragma: no cover — вероятность исчезающе мала
            raise NotFoundError(message_key="invite.not_found", domain=DOMAIN)

        invite = ClanInviteCode(
            code=code,
            role=payload.role,
            max_uses=payload.max_uses,
            expires_at=(
                datetime.now(UTC) + timedelta(hours=payload.expires_in_hours)
                if payload.expires_in_hours
                else None
            ),
            created_by=self.principal.user_id,
        )
        self.session.add(invite)
        await self.session.commit()
        await self.session.refresh(invite)
        return invite, self.t.t("invite.created", domain=DOMAIN, code=invite.code)

    async def revoke_invite(self, invite_id) -> None:  # noqa: ANN001
        invite = await self._get_scoped(
            ClanInviteCode, invite_id,
            not_found_key="invite.not_found", domain=DOMAIN, for_update=True,
        )
        if invite.revoked_at is None:      # идемпотентно
            invite.revoked_at = datetime.now(UTC)
            await self.session.commit()
