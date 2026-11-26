"""Add game identity metadata for imported Foxhole stockpiles."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0044_game_stockpile_identity"
down_revision = "0043_mail_dispatch_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stockpiles", sa.Column("game_key", sa.String(64), nullable=True))
    op.add_column("stockpiles", sa.Column("game_type", sa.String(64), nullable=True))
    op.add_column("stockpiles", sa.Column("faction", sa.String(32), nullable=True))
    op.add_column("stockpiles", sa.Column("game_x", sa.Float(), nullable=True))
    op.add_column("stockpiles", sa.Column("game_y", sa.Float(), nullable=True))
    op.add_column("stockpiles", sa.Column("game_scanned_at", sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint(
        "uq_stockpiles_clan_game_key", "stockpiles", ["clan_id", "game_key"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_stockpiles_clan_game_key", "stockpiles", type_="unique")
    for column in ("game_scanned_at", "game_y", "game_x", "faction", "game_type", "game_key"):
        op.drop_column("stockpiles", column)
