"""clan_operations: операции клана — календарь, снимок карты из «Планирования», опрос участников

Revision ID: 0019_clan_operations
Revises: 0018_clan_courses
Create Date: 2026-10-27
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0019_clan_operations"
down_revision = "0018_clan_courses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clan_operations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("clan_id", sa.String(64), sa.ForeignKey("clans.id", ondelete="CASCADE", name="fk_clan_operations_clan_id_clans"), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("note", sa.String(1000), nullable=False, server_default=""),
        sa.Column("snapshot", postgresql.JSONB(), nullable=True),
        sa.Column("report_ids", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("participants", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("author_id", sa.String(64), nullable=False),
        sa.Column("author_name", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_clan_operations_clan_id", "clan_operations", ["clan_id"])
    op.create_index("ix_clan_operations_clan_date", "clan_operations", ["clan_id", "date"])


def downgrade() -> None:
    op.drop_index("ix_clan_operations_clan_date", table_name="clan_operations")
    op.drop_index("ix_clan_operations_clan_id", table_name="clan_operations")
    op.drop_table("clan_operations")
