"""report_events: лента заказа и комментарии; флаги писем «штаба» (напоминание, доставлен)

Revision ID: 0023_report_events
Revises: 0022_report_tasks
Create Date: 2026-10-27
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0023_report_events"
down_revision = "0022_report_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "report_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("clan_id", sa.String(64), sa.ForeignKey("clans.id", ondelete="CASCADE", name="fk_report_events_clan_id_clans"), nullable=False),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("order_reports.id", ondelete="CASCADE", name="fk_report_events_report_id_order_reports"), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("actor_id", sa.String(64), nullable=False),
        sa.Column("actor_name", sa.String(120), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_report_events_clan_id", "report_events", ["clan_id"])
    op.create_index("ix_report_events_report", "report_events", ["report_id", "created_at"])
    op.add_column("order_reports", sa.Column("reminded_due", sa.Date(), nullable=True))
    op.add_column("order_reports", sa.Column("delivered_notified", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("order_reports", "delivered_notified")
    op.drop_column("order_reports", "reminded_due")
    op.drop_index("ix_report_events_report", table_name="report_events")
    op.drop_index("ix_report_events_clan_id", table_name="report_events")
    op.drop_table("report_events")
