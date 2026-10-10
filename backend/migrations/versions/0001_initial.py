"""initial: rbac + catalog + orders + stockpiles (mulitenancy base)

Свежая установка. Для существующих БД с данными — см. 0002 (backfill clan_id).

Revision ID: 0001_initial
Revises:
Create Date: 2024-06-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

clan_role = postgresql.ENUM(
    "owner", "admin", "officer", "member", "guest",
    name="clan_role", create_type=False,
)
order_status = postgresql.ENUM(
    "draft", "queued", "in_progress", "done", "cancelled",
    name="order_status", create_type=False,
)


def _ts() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    ]


def _uuid_pk() -> sa.Column:
    return sa.Column(
        "id", postgresql.UUID(as_uuid=True), primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )


def _clan_fk() -> sa.Column:
    return sa.Column(
        "clan_id", sa.String(64),
        sa.ForeignKey("clans.id", ondelete="CASCADE"), nullable=False,
    )


def upgrade() -> None:
    bind = op.get_bind()
    clan_role.create(bind, checkfirst=True)
    order_status.create(bind, checkfirst=True)

    op.create_table(
        "clans",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("default_locale", sa.String(8), server_default="en", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        *_ts(),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("preferred_locale", sa.String(8), nullable=True),
        *_ts(),
    )

    op.create_table(
        "clan_memberships",
        _uuid_pk(),
        _clan_fk(),
        sa.Column("user_id", sa.String(64),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", clan_role, server_default="member", nullable=False),
        sa.Column("extra_scopes", postgresql.JSONB,
                  server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("revoked_scopes", postgresql.JSONB,
                  server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.UniqueConstraint("clan_id", "user_id", name="uq_clan_memberships_clan_id_user_id"),
        *_ts(),
    )
    op.create_index("ix_clan_memberships_clan_id", "clan_memberships", ["clan_id"])
    op.create_index("ix_clan_memberships_clan_role", "clan_memberships", ["clan_id", "role"])

    op.create_table(
        "clan_api_tokens",
        _uuid_pk(),
        _clan_fk(),
        sa.Column("label", sa.String(64), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("role", clan_role, server_default="guest", nullable=False),
        sa.Column("extra_scopes", postgresql.JSONB,
                  server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        *_ts(),
    )
    op.create_index("ix_clan_api_tokens_clan_id", "clan_api_tokens", ["clan_id"])
    op.create_index("ix_clan_api_tokens_hash", "clan_api_tokens", ["token_hash"], unique=True)

    # ГЛОБАЛЬНЫЙ справочник: без clan_id осознанно
    op.create_table(
        "catalog_items",
        sa.Column("code", sa.String(64), primary_key=True),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("crate_size", sa.Integer(), server_default="1", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.create_index("ix_catalog_items_category", "catalog_items", ["category"])

    op.create_table(
        "orders",
        _uuid_pk(),
        _clan_fk(),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("status", order_status, server_default="draft", nullable=False),
        sa.Column("item_code", sa.String(64),
                  sa.ForeignKey("catalog_items.code", ondelete="RESTRICT"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("produced", sa.Integer(), server_default="0", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(64), nullable=False),
        sa.Column("assignee_id", sa.String(64), nullable=True),
        sa.CheckConstraint("quantity > 0", name="quantity_positive"),
        *_ts(),
    )
    op.create_index("ix_orders_clan_id", "orders", ["clan_id"])
    op.create_index("ix_orders_clan_status_created", "orders",
                    ["clan_id", "status", "created_at"])

    op.create_table(
        "stockpiles",
        _uuid_pk(),
        _clan_fk(),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("region", sa.String(64), nullable=False),
        sa.UniqueConstraint("clan_id", "name", name="uq_stockpiles_clan_id_name"),
        *_ts(),
    )
    op.create_index("ix_stockpiles_clan_id", "stockpiles", ["clan_id"])

    op.create_table(
        "stockpile_items",
        _uuid_pk(),
        _clan_fk(),
        sa.Column("stockpile_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("stockpiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_code", sa.String(64),
                  sa.ForeignKey("catalog_items.code"), nullable=False),
        sa.Column("quantity", sa.Integer(), server_default="0", nullable=False),
        sa.UniqueConstraint("stockpile_id", "item_code",
                            name="uq_stockpile_items_stockpile_id_item_code"),
        *_ts(),
    )
    op.create_index("ix_stockpile_items_clan_id", "stockpile_items", ["clan_id"])
    op.create_index("ix_stockpile_items_clan_item", "stockpile_items", ["clan_id", "item_code"])


def downgrade() -> None:
    op.drop_table("stockpile_items")
    op.drop_table("stockpiles")
    op.drop_table("orders")
    op.drop_table("catalog_items")
    op.drop_table("clan_api_tokens")
    op.drop_table("clan_memberships")
    op.drop_table("users")
    op.drop_table("clans")
    order_status.drop(op.get_bind(), checkfirst=True)
    clan_role.drop(op.get_bind(), checkfirst=True)
