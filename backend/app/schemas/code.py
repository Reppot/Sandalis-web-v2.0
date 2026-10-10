from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.permissions import ClanRole

# Ограничение осознанное: invite-код не может сразу давать admin/owner —
# эти роли назначаются только владельцем вручную через membership.
GRANTABLE_ROLES = frozenset({ClanRole.GUEST, ClanRole.MEMBER, ClanRole.OFFICER})


class InviteCodeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: ClanRole = ClanRole.MEMBER
    max_uses: Annotated[int, Field(gt=0, le=1000)] = 1
    expires_in_hours: Annotated[int | None, Field(default=None, gt=0, le=24 * 30)]

    @field_validator("role")
    @classmethod
    def _grantable(cls, v: ClanRole) -> ClanRole:
        if v not in GRANTABLE_ROLES:
            raise ValueError("role must be guest/member/officer")
        return v


class InviteCodeRead(BaseModel):
    # clan_id НЕ отдаём наружу
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    role: ClanRole
    max_uses: int
    used_count: int
    expires_at: datetime | None
    revoked_at: datetime | None
    created_by: str
    created_at: datetime


class InviteCodeCreated(BaseModel):
    invite: InviteCodeRead
    message: str
