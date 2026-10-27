"""Операции со многими снимками; почта общая для сайта; ответ разработчика на обратную связь

Revision ID: 0021_snapshots_site_mail
Revises: 0020_mail_mentions
Create Date: 2026-10-27
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0021_snapshots_site_mail"
down_revision = "0020_mail_mentions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # снимок операции → список снимков (старый снимок становится первым)
    op.add_column("clan_operations", sa.Column("snapshots", postgresql.JSONB(), nullable=False, server_default="[]"))
    # операция без карты хранила JSON null (а не SQL NULL) — такие пропускаем
    op.execute(
        "UPDATE clan_operations SET snapshots = jsonb_build_array(snapshot || jsonb_build_object('name', title)) "
        "WHERE snapshot IS NOT NULL AND jsonb_typeof(snapshot) = 'object'"
    )
    op.drop_column("clan_operations", "snapshot")

    # почта сайта: письмо может быть и без клана (ответ разработчика на обратную связь)
    op.alter_column("clan_mail", "clan_id", existing_type=sa.String(64), nullable=True)
    op.drop_index("ix_clan_mail_recipient", table_name="clan_mail")
    op.create_index("ix_clan_mail_user", "clan_mail", ["recipient_id", "created_at"])

    op.add_column("feedback", sa.Column("reply", sa.Text(), nullable=True))
    op.add_column("feedback", sa.Column("replied_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("feedback", "replied_at")
    op.drop_column("feedback", "reply")
    op.drop_index("ix_clan_mail_user", table_name="clan_mail")
    op.create_index("ix_clan_mail_recipient", "clan_mail", ["clan_id", "recipient_id", "created_at"])
    op.alter_column("clan_mail", "clan_id", existing_type=sa.String(64), nullable=False)
    op.add_column("clan_operations", sa.Column("snapshot", postgresql.JSONB(), nullable=True))
    op.execute("UPDATE clan_operations SET snapshot = snapshots -> 0 WHERE jsonb_array_length(snapshots) > 0")
    op.drop_column("clan_operations", "snapshots")
