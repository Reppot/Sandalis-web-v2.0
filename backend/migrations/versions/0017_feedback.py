"""feedback: обратная связь о сайте от участников (глобальная, читает владелец сайта)

Revision ID: 0017_feedback
Revises: 0016_stockpile_loose_quantity
Create Date: 2026-10-25
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0017_feedback"
down_revision = "0016_stockpile_loose_quantity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feedback",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("user_name", sa.String(120), nullable=False),
        sa.Column("clan_id", sa.String(64), nullable=True),
        sa.Column("clan_name", sa.String(120), nullable=True),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("page", sa.String(120), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_feedback_created", "feedback", ["created_at"])
    op.create_index("ix_feedback_user", "feedback", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_feedback_user", table_name="feedback")
    op.drop_index("ix_feedback_created", table_name="feedback")
    op.drop_table("feedback")
