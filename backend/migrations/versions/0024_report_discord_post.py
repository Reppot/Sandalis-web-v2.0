"""order_reports: пост бота в Discord (канал, сообщение, язык) — кнопки и обновление поста

Revision ID: 0024_report_discord_post
Revises: 0023_report_events
Create Date: 2026-10-27
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0024_report_discord_post"
down_revision = "0023_report_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("order_reports", sa.Column("discord_channel_id", sa.String(32), nullable=True))
    op.add_column("order_reports", sa.Column("discord_message_id", sa.String(32), nullable=True))
    op.add_column("order_reports", sa.Column("discord_locale", sa.String(8), nullable=True))


def downgrade() -> None:
    op.drop_column("order_reports", "discord_locale")
    op.drop_column("order_reports", "discord_message_id")
    op.drop_column("order_reports", "discord_channel_id")
