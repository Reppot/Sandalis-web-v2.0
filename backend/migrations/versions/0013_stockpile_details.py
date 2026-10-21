"""stockpiles: город, тип постройки и пароль склада (раздел «Ваш клан» → «Склады клана»)

Revision ID: 0013_stockpile_details
Revises: 0012_supply_pyramid
Create Date: 2026-10-22
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0013_stockpile_details"
down_revision = "0012_supply_pyramid"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stockpiles", sa.Column("town", sa.String(80), nullable=True))
    op.add_column("stockpiles", sa.Column("kind", sa.String(16), nullable=True))
    op.add_column("stockpiles", sa.Column("access_code", sa.String(32), nullable=True))


def downgrade() -> None:
    for column in ("access_code", "kind", "town"):
        op.drop_column("stockpiles", column)
