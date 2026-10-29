"""Уведомления вне сайта: ЛС Discord (согласие), подписки Web Push, отметка рассылки письма

Revision ID: 0038_notifications
Revises: 0037_report_thread
Create Date: 2026-10-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0038_notifications"
down_revision = "0037_report_thread"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("notify_dm", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("clan_mail", sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True))
    # старые письма не рассылаем задним числом
    op.execute("UPDATE clan_mail SET delivered_at = now()")
    op.create_table(
        "push_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("endpoint", sa.String(600), nullable=False, unique=True),
        sa.Column("p256dh", sa.String(200), nullable=False),
        sa.Column("auth", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_push_subscriptions_user_id", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
    op.drop_column("clan_mail", "delivered_at")
    op.drop_column("users", "notify_dm")
