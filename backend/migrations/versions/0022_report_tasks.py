"""order_reports: заказ как задача — исполнители, приоритет, срок, теги, привязка к операции

Revision ID: 0022_report_tasks
Revises: 0021_snapshots_site_mail
Create Date: 2026-10-27
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0022_report_tasks"
down_revision = "0021_snapshots_site_mail"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("order_reports", sa.Column("assignees", postgresql.JSONB(), nullable=False, server_default="[]"))
    op.add_column("order_reports", sa.Column("priority", sa.String(8), nullable=False, server_default="normal"))
    op.add_column("order_reports", sa.Column("due_date", sa.Date(), nullable=True))
    op.add_column("order_reports", sa.Column("tags", postgresql.JSONB(), nullable=False, server_default="[]"))
    op.add_column("order_reports", sa.Column("operation_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_order_reports_operation_id_clan_operations", "order_reports", "clan_operations",
                          ["operation_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_order_reports_operation_id_clan_operations", "order_reports", type_="foreignkey")
    for col in ("operation_id", "tags", "due_date", "priority", "assignees"):
        op.drop_column("order_reports", col)
