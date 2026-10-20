"""clan_settings: снимок ролей Discord-сервера и уровни доступа

* discord_roles — роли сервера, подтянутые командиром через бота (id, name, color, position);
* discord_roles_synced_at — когда подтягивали;
* discord_role_map теперь {id роли: уровень basic|medium|high} — прежние значения
  (guest/member/officer/admin) сбрасываются, по умолчанию любая роль = basic;
* discord_role_sync больше не нужен: роли работают, как только командир их подтянул.

Revision ID: 0008_discord_role_levels
Revises: 0007_discord_role_sync
Create Date: 2026-10-20
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008_discord_role_levels"
down_revision = "0007_discord_role_sync"
branch_labels = None
depends_on = None

JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.add_column("clan_settings", sa.Column("discord_roles", JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False))
    op.add_column("clan_settings", sa.Column("discord_roles_synced_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE clan_settings SET discord_role_map = '{}'::jsonb")
    op.drop_column("clan_settings", "discord_role_sync")


def downgrade() -> None:
    op.add_column("clan_settings", sa.Column(
        "discord_role_sync", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.drop_column("clan_settings", "discord_roles_synced_at")
    op.drop_column("clan_settings", "discord_roles")
