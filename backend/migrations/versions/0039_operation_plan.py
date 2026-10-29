"""Операция: детальный план (роли со слотами, отряды, этапы, точки, скрытое из брифинга, итоги)

Revision ID: 0039_operation_plan
Revises: 0038_notifications
Create Date: 2026-10-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0039_operation_plan"
down_revision = "0038_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clan_operations", sa.Column("plan", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")))


def downgrade() -> None:
    op.drop_column("clan_operations", "plan")
