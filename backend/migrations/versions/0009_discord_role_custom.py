"""clan_settings.discord_role_perms: кастомные права ролей Discord

{id роли: [права]} для ролей с уровнем custom (вкладка «Управление»).

Revision ID: 0009_discord_role_custom
Revises: 0008_discord_role_levels
Create Date: 2026-10-20
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0009_discord_role_custom"
down_revision = "0008_discord_role_levels"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clan_settings", sa.Column(
        "discord_role_perms", postgresql.JSONB(astext_type=sa.Text()),
        server_default=sa.text("'{}'::jsonb"), nullable=False))


def downgrade() -> None:
    op.drop_column("clan_settings", "discord_role_perms")
