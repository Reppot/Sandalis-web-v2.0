"""domain modules: timers + clan_invite_codes, расширение catalog_items

Перенос доменов из старого backend (git history d3d724b) в архитектуру v2.0:
  * catalog_items: name/english_name/icon_url/production_time (бэкфилл name=code);
  * timers — clan-scoped, clan_id первым столбцом индекса (clan_id, ends_at);
  * clan_invite_codes — clan-scoped, уникальный короткий код.

Миграция аддитивна и безопасна поверх 0002; на чистой базе после
0001+0002 выполняется штатно один раз.

Revision ID: 0003_domain_modules
Revises: 0002_clan_scope_backfill
Create Date: 2024-06-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_domain_modules"
down_revision = "0002_clan_scope_backfill"
branch_labels = None
depends_on = None

clan_role = postgresql.ENUM(
    "owner", "admin", "officer", "member", "guest",
    name="clan_role", create_type=False,
)


def _ts() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    # --- catalog_items: поля из старого models/item.py (глобально, без clan_id)
    op.add_column(
        "catalog_items",
        sa.Column("name", sa.String(255), server_default="", nullable=False),
    )
    op.add_column(
        "catalog_items",
        sa.Column("english_name", sa.String(255), server_default="", nullable=False),
    )
    op.add_column(
        "catalog_items",
        sa.Column("icon_url", sa.String(512), nullable=True),
    )
    op.add_column(
        "catalog_items",
        sa.Column("production_time", sa.Integer(), server_default="0", nullable=False),
    )
    op.execute("UPDATE catalog_items SET name = code WHERE name = ''")

    # --- timers (clan-scoped) ------------------------------------------------
    op.create_table(
        "timers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("clan_id", sa.String(64),
                  sa.ForeignKey("clans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(32), server_default="stockpile_decay", nullable=False),
        sa.Column("duration_seconds", sa.Integer(),
                  server_default="172800", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("stockpile_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("stockpiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(64), nullable=False),
        *_ts(),
    )
    op.create_index("ix_timers_clan_id", "timers", ["clan_id"])
    op.create_index("ix_timers_clan_ends", "timers", ["clan_id", "ends_at"])

    # --- clan_invite_codes (clan-scoped) --------------------------------------
    op.create_table(
        "clan_invite_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("clan_id", sa.String(64),
                  sa.ForeignKey("clans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(24), nullable=False),
        sa.Column("role", clan_role, server_default="member", nullable=False),
        sa.Column("max_uses", sa.Integer(), server_default="1", nullable=False),
        sa.Column("used_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(64), nullable=False),
        *_ts(),
    )
    op.create_index("ix_clan_invite_codes_clan_id", "clan_invite_codes", ["clan_id"])
    op.create_index("ix_clan_invite_codes_code", "clan_invite_codes", ["code"], unique=True)


def downgrade() -> None:
    op.drop_table("clan_invite_codes")
    op.drop_table("timers")
    op.drop_column("catalog_items", "production_time")
    op.drop_column("catalog_items", "icon_url")
    op.drop_column("catalog_items", "english_name")
    op.drop_column("catalog_items", "name")
