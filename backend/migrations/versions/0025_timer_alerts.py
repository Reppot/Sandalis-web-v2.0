"""Напоминания о резервных складах: отметки на таймерах и настройки клана

Revision ID: 0025_timer_alerts
Revises: 0024_report_discord_post
Create Date: 2026-10-27
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0025_timer_alerts"
down_revision = "0024_report_discord_post"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("timers", sa.Column("warned_for", sa.DateTime(timezone=True), nullable=True))
    op.add_column("timers", sa.Column("expired_for", sa.DateTime(timezone=True), nullable=True))
    # уже истёкшие таймеры — без запоздалых писем после выкладки
    op.execute("UPDATE timers SET warned_for = ends_at, expired_for = ends_at WHERE ends_at <= now()")
    op.add_column("clan_settings", sa.Column("timer_ping_role_id", sa.String(32), nullable=True))
    op.add_column("clan_settings", sa.Column("timer_warn_minutes", sa.Integer(), server_default=sa.text("120"), nullable=False))
    op.add_column("clan_settings", sa.Column("discord_locale", sa.String(8), nullable=True))


def downgrade() -> None:
    op.drop_column("clan_settings", "discord_locale")
    op.drop_column("clan_settings", "timer_warn_minutes")
    op.drop_column("clan_settings", "timer_ping_role_id")
    op.drop_column("timers", "expired_for")
    op.drop_column("timers", "warned_for")
