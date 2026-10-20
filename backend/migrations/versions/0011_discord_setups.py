"""discord_setups: состояние незавершённого Discord-входа на сервере

Кука выбора сервера переполняла лимит браузера (~4 КБ) у владельцев многих
серверов — теперь в куке только подписанный id строки.

Revision ID: 0011_discord_setups
Revises: 0010_reset_clan_data
Create Date: 2026-10-21
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0011_discord_setups"
down_revision = "0010_reset_clan_data"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "discord_setups",
        sa.Column("id", sa.String(48), primary_key=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()),
                  server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_discord_setups_expires_at", "discord_setups", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_discord_setups_expires_at", table_name="discord_setups")
    op.drop_table("discord_setups")
