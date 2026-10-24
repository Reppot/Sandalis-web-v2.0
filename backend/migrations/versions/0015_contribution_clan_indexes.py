"""report_contributions: индексы clan_id (как у остальных таблиц клана)

Revision ID: 0015_contribution_clan_indexes
Revises: 0014_report_contributions
Create Date: 2026-10-24
"""
from __future__ import annotations

from alembic import op

revision = "0015_contribution_clan_indexes"
down_revision = "0014_report_contributions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_report_contributions_clan_id", "report_contributions", ["clan_id"])
    op.create_index("ix_report_contribution_lines_clan_id", "report_contribution_lines", ["clan_id"])


def downgrade() -> None:
    op.drop_index("ix_report_contribution_lines_clan_id", table_name="report_contribution_lines")
    op.drop_index("ix_report_contributions_clan_id", table_name="report_contributions")
