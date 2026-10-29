"""Общий план клана в «Планировании»; напоминание не ответившим на опрос операции

Revision ID: 0042_clan_plan_rsvp
Revises: 0041_ops_points_from_planning
Create Date: 2026-10-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0042_clan_plan_rsvp"
down_revision = "0041_ops_points_from_planning"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clan_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("clan_id", sa.String(64), sa.ForeignKey("clans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("shapes", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("version", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("updated_by_name", sa.String(120), server_default="", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("clan_id", name="uq_clan_plans_clan_id"),
    )
    op.add_column("clan_operations", sa.Column("rsvp_asked", sa.Boolean(), server_default=sa.text("false"), nullable=False))


def downgrade() -> None:
    op.drop_column("clan_operations", "rsvp_asked")
    op.drop_table("clan_plans")
