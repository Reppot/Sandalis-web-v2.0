"""Заказ: ветка обсуждения под постом бота в Discord

Revision ID: 0037_report_thread
Revises: 0036_operation_discord
Create Date: 2026-10-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0037_report_thread"
down_revision = "0036_operation_discord"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("order_reports", sa.Column("discord_thread_id", sa.String(32), nullable=True))


def downgrade() -> None:
    op.drop_column("order_reports", "discord_thread_id")
