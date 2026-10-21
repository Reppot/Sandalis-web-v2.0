"""clan_settings.supply_pyramid: пирамида снабжения клана

{faction, tiers: [{title, items: [{code, crates}]}]}; NULL — шаблон по умолчанию.

Revision ID: 0012_supply_pyramid
Revises: 0011_discord_setups
Create Date: 2026-10-22
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0012_supply_pyramid"
down_revision = "0011_discord_setups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clan_settings", sa.Column("supply_pyramid", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("clan_settings", sa.Column("supply_pyramid_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("clan_settings", "supply_pyramid_updated_at")
    op.drop_column("clan_settings", "supply_pyramid")
