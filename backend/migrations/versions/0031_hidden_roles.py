"""Скрытые роли Discord: не подтягиваются на сайт

Revision ID: 0031_hidden_roles
Revises: 0030_basic_empty
Create Date: 2026-10-28
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0031_hidden_roles"
down_revision = "0030_basic_empty"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clan_settings", sa.Column("discord_roles_hidden", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False))


def downgrade() -> None:
    op.drop_column("clan_settings", "discord_roles_hidden")
