"""Уровень «Базовый» — без прав вообще.

Участникам с записанным базовым набором (миграции 0028–0029) отзываем весь пресет участника;
остальные пересчитаются при следующем входе.

Revision ID: 0030_basic_empty
Revises: 0029_basic_no_stockpile_create
Create Date: 2026-10-28
"""
from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op

revision = "0030_basic_empty"
down_revision = "0029_basic_no_stockpile_create"
branch_labels = None
depends_on = None

# пресет участника на момент миграции (код приложения не импортируем)
MEMBER = sorted({
    "stockpiles:read", "reports:read", "timers:read", "catalog:read", "pyramid:read", "reports:take",
    "operations:read", "operations:attend", "clan:stats",
    "stockpiles:create", "stockpiles:edit", "stockpiles:delete", "stockpiles:items", "stockpiles:codes",
    "reports:create", "reports:status", "reports:assign", "reports:comment", "reports:edit", "reports:discord",
    "reports:progress", "operations:create",
})


def upgrade() -> None:
    op.get_bind().execute(
        sa.text(
            "UPDATE clan_memberships SET extra_scopes = '[]'::jsonb, revoked_scopes = CAST(:revoked AS jsonb) "
            "WHERE role = 'member' AND extra_scopes = '[\"clan:training\"]'::jsonb AND revoked_scopes ? 'stockpiles:create'"
        ),
        {"revoked": json.dumps(MEMBER)},
    )


def downgrade() -> None:
    pass
