"""Операции: время начала, пост/ветка/событие в Discord, отметка напоминания

Revision ID: 0036_operation_discord
Revises: 0035_audit_log
Create Date: 2026-10-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0036_operation_discord"
down_revision = "0035_audit_log"
branch_labels = None
depends_on = None

COLS = ("discord_channel_id", "discord_message_id", "discord_thread_id", "discord_event_id")


def upgrade() -> None:
    op.add_column("clan_operations", sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True))
    for c in COLS:
        op.add_column("clan_operations", sa.Column(c, sa.String(32), nullable=True))
    op.add_column("clan_operations", sa.Column("reminded", sa.Boolean(), server_default=sa.text("false"), nullable=False))


def downgrade() -> None:
    op.drop_column("clan_operations", "reminded")
    for c in COLS:
        op.drop_column("clan_operations", c)
    op.drop_column("clan_operations", "starts_at")
