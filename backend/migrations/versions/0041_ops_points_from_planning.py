"""Операция: точки плана — только из меток «Точка» на снимках «Планирования»

Точки, добавленные вручную в плане операции, ни к чему на карте не привязаны — убираем;
дальше они приходят со снимками (operation_plan.sync_points).

Revision ID: 0041_ops_points_from_planning
Revises: 0040_drop_ticker_phrases
Create Date: 2026-10-29
"""
from __future__ import annotations

from alembic import op

revision = "0041_ops_points_from_planning"
down_revision = "0040_drop_ticker_phrases"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE clan_operations SET plan = jsonb_set(plan, '{points}', '[]'::jsonb) WHERE plan ? 'points'")


def downgrade() -> None:
    pass
