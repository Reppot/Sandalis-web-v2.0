"""report_contributions: журнал выполнения заказа — кто, сколько и на какой склад привёз

Revision ID: 0014_report_contributions
Revises: 0013_stockpile_details
Create Date: 2026-10-22
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0014_report_contributions"
down_revision = "0013_stockpile_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "report_contributions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("clan_id", sa.String(64), sa.ForeignKey("clans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("order_reports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("user_name", sa.String(120), nullable=True),
        sa.Column("stockpile_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("stockpiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("stockpile_label", sa.String(160), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_report_contributions_clan_report", "report_contributions", ["clan_id", "report_id"])
    op.create_table(
        "report_contribution_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("clan_id", sa.String(64), sa.ForeignKey("clans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contribution_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("report_contributions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("line_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("order_report_lines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_report_contribution_lines_quantity_positive"),
    )
    op.create_index("ix_report_contribution_lines_contribution_id", "report_contribution_lines", ["contribution_id"])


def downgrade() -> None:
    op.drop_table("report_contribution_lines")
    op.drop_table("report_contributions")
