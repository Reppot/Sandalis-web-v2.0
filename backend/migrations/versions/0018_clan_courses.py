"""clan_courses: курсы клана в разделе «Обучение» (пишет командир/офицер с clan:content)

Revision ID: 0018_clan_courses
Revises: 0017_feedback
Create Date: 2026-10-26
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0018_clan_courses"
down_revision = "0017_feedback"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clan_courses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("clan_id", sa.String(64), sa.ForeignKey("clans.id", ondelete="CASCADE", name="fk_clan_courses_clan_id_clans"), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("summary", sa.String(300), nullable=False, server_default=""),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("sort", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("author_id", sa.String(64), nullable=False),
        sa.Column("author_name", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_clan_courses_clan_id", "clan_courses", ["clan_id"])
    op.create_index("ix_clan_courses_clan_sort", "clan_courses", ["clan_id", "sort"])


def downgrade() -> None:
    op.drop_index("ix_clan_courses_clan_sort", table_name="clan_courses")
    op.drop_index("ix_clan_courses_clan_id", table_name="clan_courses")
    op.drop_table("clan_courses")
