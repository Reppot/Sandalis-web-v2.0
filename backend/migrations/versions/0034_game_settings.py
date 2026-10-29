"""Очки снабжения: настройки командира, Зал славы, служебное состояние

Revision ID: 0034_game_settings
Revises: 0033_game_awards
Create Date: 2026-10-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0034_game_settings"
down_revision = "0033_game_awards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clan_settings", sa.Column("game_settings", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False))
    op.add_column("clan_settings", sa.Column("game_hall", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False))
    op.add_column("clan_settings", sa.Column("game_state", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False))


def downgrade() -> None:
    op.drop_column("clan_settings", "game_state")
    op.drop_column("clan_settings", "game_hall")
    op.drop_column("clan_settings", "game_settings")
