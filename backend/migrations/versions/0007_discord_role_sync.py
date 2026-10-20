"""clan_settings: синхронизация ролей с Discord-сервером клана

discord_role_sync — включена ли выдача ролей терминала по ролям Discord;
discord_role_map — {id роли Discord: роль терминала (guest/member/officer/admin)}.

Revision ID: 0007_discord_role_sync
Revises: 0006_clan_discord_guild
Create Date: 2026-10-20
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007_discord_role_sync"
down_revision = "0006_clan_discord_guild"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clan_settings", sa.Column(
        "discord_role_sync", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("clan_settings", sa.Column(
        "discord_role_map", postgresql.JSONB(astext_type=sa.Text()),
        server_default=sa.text("'{}'::jsonb"), nullable=False))


def downgrade() -> None:
    op.drop_column("clan_settings", "discord_role_map")
    op.drop_column("clan_settings", "discord_role_sync")
