"""clans.discord_guild_id: клан привязан к Discord-серверу его владельца

Владелец сервера при первом входе через Discord выбирает сервер клана
(scope=guilds, флаг owner) и получает роль owner; остальные вступают по
invite-ссылке.

Revision ID: 0006_clan_discord_guild
Revises: 0005_terminal_content
Create Date: 2026-10-20
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006_clan_discord_guild"
down_revision = "0005_terminal_content"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clans", sa.Column("discord_guild_id", sa.String(32), nullable=True))
    op.add_column("clans", sa.Column("icon_url", sa.String(512), nullable=True))
    op.create_unique_constraint("uq_clans_discord_guild_id", "clans", ["discord_guild_id"])


def downgrade() -> None:
    op.drop_constraint("uq_clans_discord_guild_id", "clans", type_="unique")
    op.drop_column("clans", "icon_url")
    op.drop_column("clans", "discord_guild_id")
