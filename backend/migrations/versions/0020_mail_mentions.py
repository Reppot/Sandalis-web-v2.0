"""clan_mail + clan_memberships.discord_role_ids: почта на сайте и упоминания @роль

Revision ID: 0020_mail_mentions
Revises: 0019_clan_operations
Create Date: 2026-10-27
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0020_mail_mentions"
down_revision = "0019_clan_operations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clan_memberships", sa.Column("discord_role_ids", postgresql.JSONB(), nullable=False, server_default="[]"))
    op.create_table(
        "clan_mail",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("clan_id", sa.String(64), sa.ForeignKey("clans.id", ondelete="CASCADE", name="fk_clan_mail_clan_id_clans"), nullable=False),
        sa.Column("recipient_id", sa.String(64), nullable=False),
        sa.Column("sender_id", sa.String(64), nullable=False),
        sa.Column("sender_name", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_clan_mail_clan_id", "clan_mail", ["clan_id"])
    op.create_index("ix_clan_mail_recipient", "clan_mail", ["clan_id", "recipient_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_clan_mail_recipient", table_name="clan_mail")
    op.drop_index("ix_clan_mail_clan_id", table_name="clan_mail")
    op.drop_table("clan_mail")
    op.drop_column("clan_memberships", "discord_role_ids")
