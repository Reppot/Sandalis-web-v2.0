"""Чёрный список клана: участники и роли Discord

Revision ID: 0027_clan_blacklist
Revises: 0026_more_scopes
Create Date: 2026-10-28
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0027_clan_blacklist"
down_revision = "0026_more_scopes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clan_settings", sa.Column("blacklist_users", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False))
    op.add_column("clan_settings", sa.Column("blacklist_roles", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False))


def downgrade() -> None:
    op.drop_column("clan_settings", "blacklist_roles")
    op.drop_column("clan_settings", "blacklist_users")
