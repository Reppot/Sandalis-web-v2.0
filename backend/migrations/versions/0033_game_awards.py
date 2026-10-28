"""Награды очков снабжения (для поздравлений) и неделя последней сводки в Discord

Revision ID: 0033_game_awards
Revises: 0032_timer_event_kind
Create Date: 2026-10-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0033_game_awards"
down_revision = "0032_timer_event_kind"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "game_awards",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("clan_id", sa.String(64), sa.ForeignKey("clans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("key", sa.String(48), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("clan_id", "user_id", "key", name="uq_game_awards"),
    )
    op.create_index("ix_game_awards_clan_id", "game_awards", ["clan_id"])
    op.add_column("clan_settings", sa.Column("game_digest_week", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("clan_settings", "game_digest_week")
    op.drop_index("ix_game_awards_clan_id", table_name="game_awards")
    op.drop_table("game_awards")
