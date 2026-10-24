"""stockpile_items.loose_quantity: предметы не в ящиках отдельно от ящиков

Revision ID: 0016_stockpile_loose_quantity
Revises: 0015_contribution_clan_indexes
Create Date: 2026-10-24
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0016_stockpile_loose_quantity"
down_revision = "0015_contribution_clan_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "stockpile_items",
        sa.Column("loose_quantity", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("stockpile_items", "loose_quantity")
