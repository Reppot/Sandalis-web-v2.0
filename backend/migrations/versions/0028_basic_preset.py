"""Уровень «Базовый»: свой набор прав вместо полного пресета участника.

Участникам, у которых сейчас ровно пресет участника (уровень «Базовый», без кастомных прав),
сразу записываем новый набор; остальные пересчитаются при следующем входе.

Revision ID: 0028_basic_preset
Revises: 0027_clan_blacklist
Create Date: 2026-10-28
"""
from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op

revision = "0028_basic_preset"
down_revision = "0027_clan_blacklist"
branch_labels = None
depends_on = None

# состояние на момент миграции (не импортируем код приложения — он будет меняться)
MEMBER = {
    "stockpiles:read", "reports:read", "timers:read", "catalog:read", "pyramid:read", "reports:take",
    "operations:read", "operations:attend", "clan:stats",
    "stockpiles:create", "stockpiles:edit", "stockpiles:delete", "stockpiles:items", "stockpiles:codes",
    "reports:create", "reports:status", "reports:assign", "reports:comment", "reports:edit", "reports:discord",
    "reports:progress", "operations:create",
}
BASIC = {
    "stockpiles:read", "stockpiles:create", "pyramid:read", "operations:attend", "catalog:read",
    "clan:stats", "clan:training",
}


def upgrade() -> None:
    op.get_bind().execute(
        sa.text(
            "UPDATE clan_memberships SET extra_scopes = CAST(:extra AS jsonb), revoked_scopes = CAST(:revoked AS jsonb) "
            "WHERE role = 'member' AND extra_scopes = '[]'::jsonb AND revoked_scopes = '[]'::jsonb"
        ),
        {"extra": json.dumps(sorted(BASIC - MEMBER)), "revoked": json.dumps(sorted(MEMBER - BASIC))},
    )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text(
            "UPDATE clan_memberships SET extra_scopes = '[]'::jsonb, revoked_scopes = '[]'::jsonb "
            "WHERE role = 'member' AND extra_scopes = CAST(:extra AS jsonb) AND revoked_scopes = CAST(:revoked AS jsonb)"
        ),
        {"extra": json.dumps(sorted(BASIC - MEMBER)), "revoked": json.dumps(sorted(MEMBER - BASIC))},
    )
