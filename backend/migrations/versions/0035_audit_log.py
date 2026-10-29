"""Журнал чувствительных действий в клане

Revision ID: 0035_audit_log
Revises: 0034_game_settings
Create Date: 2026-10-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0035_audit_log"
down_revision = "0034_game_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("clan_id", sa.String(64), sa.ForeignKey("clans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", sa.String(64), nullable=False),
        sa.Column("actor_name", sa.String(120), nullable=False),
        sa.Column("developer", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("details", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_log_clan_created", "audit_log", ["clan_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_log_clan_created", table_name="audit_log")
    op.drop_table("audit_log")
