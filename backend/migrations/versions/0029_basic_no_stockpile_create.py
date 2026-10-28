"""Уровень «Базовый» без создания складов (stockpiles:create).

Участникам с записанным базовым набором (миграция 0028) — снять и это право;
остальные пересчитаются при следующем входе.

Revision ID: 0029_basic_no_stockpile_create
Revises: 0028_basic_preset
Create Date: 2026-10-28
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0029_basic_no_stockpile_create"
down_revision = "0028_basic_preset"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # базовый набор узнаём по extra = ["clan:training"] у роли участника без stockpiles:create в отзыве
    op.get_bind().execute(sa.text(
        "UPDATE clan_memberships "
        "SET revoked_scopes = (SELECT to_jsonb(array_agg(x ORDER BY x)) FROM jsonb_array_elements_text(revoked_scopes || '[\"stockpiles:create\"]'::jsonb) AS x) "
        "WHERE role = 'member' AND extra_scopes = '[\"clan:training\"]'::jsonb "
        "AND NOT revoked_scopes ? 'stockpiles:create' AND revoked_scopes ? 'stockpiles:edit'"
    ))


def downgrade() -> None:
    op.get_bind().execute(sa.text(
        "UPDATE clan_memberships SET revoked_scopes = revoked_scopes - 'stockpiles:create' "
        "WHERE role = 'member' AND extra_scopes = '[\"clan:training\"]'::jsonb"
    ))
