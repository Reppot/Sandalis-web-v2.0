"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-01-01 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("discord_id", sa.String(length=64), nullable=True),
        sa.Column("username", sa.String(length=128), nullable=False),
        sa.Column("avatar_url", sa.String(length=512), nullable=True),
        sa.Column(
            "role",
            sa.String(length=32),
            nullable=False,
            server_default="member",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("discord_id"),
    )
    op.create_index(
        "ix_users_discord_id",
        "users",
        ["discord_id"],
        unique=False,
    )

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column(
            "session_token",
            sa.String(length=128),
            nullable=False,
        ),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column(
            "role",
            sa.String(length=32),
            nullable=False,
            server_default="member",
        ),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_token"),
    )
    op.create_index(
        "ix_sessions_session_token",
        "sessions",
        ["session_token"],
        unique=False,
    )

    op.create_table(
        "items",
        sa.Column("id", sa.String(length=128), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "english_name",
            sa.String(length=255),
            nullable=False,
        ),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("icon_url", sa.String(length=512), nullable=True),
        sa.Column("crate_size", sa.Integer(), nullable=False),
        sa.Column("production_time", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_items_code",
        "items",
        ["code"],
        unique=False,
    )
    op.create_index(
        "ix_items_category",
        "items",
        ["category"],
        unique=False,
    )

    op.create_table(
        "recipes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("item_id", sa.String(length=128), nullable=False),
        sa.Column("facility", sa.String(length=128), nullable=False),
        sa.Column("ingredients", sa.JSON(), nullable=False),
        sa.Column("yield_quantity", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["item_id"],
            ["items.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_recipes_item_id",
        "recipes",
        ["item_id"],
        unique=False,
    )

    op.create_table(
        "orders",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("creator_id", sa.String(length=64), nullable=True),
        sa.Column("assignee_id", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("destination", sa.String(length=255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_orders_status",
        "orders",
        ["status"],
        unique=False,
    )

    op.create_table(
        "order_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.String(length=36), nullable=False),
        sa.Column("item_id", sa.String(length=128), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column(
            "completed_quantity",
            sa.Integer(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_order_items_order_id",
        "order_items",
        ["order_id"],
        unique=False,
    )

    op.create_table(
        "stockpiles",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("location", sa.String(length=255), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=True),
        sa.Column("last_updated_by", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "stockpile_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "stockpile_id",
            sa.String(length=36),
            nullable=False,
        ),
        sa.Column("item_id", sa.String(length=128), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["stockpile_id"],
            ["stockpiles.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_stockpile_items_stockpile_id",
        "stockpile_items",
        ["stockpile_id"],
        unique=False,
    )

    op.create_table(
        "timers",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column(
            "target_timestamp",
            sa.BigInteger(),
            nullable=False,
        ),
        sa.Column(
            "duration_seconds",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column("created_by", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("timers")

    op.drop_index(
        "ix_stockpile_items_stockpile_id",
        table_name="stockpile_items",
    )
    op.drop_table("stockpile_items")
    op.drop_table("stockpiles")

    op.drop_index(
        "ix_order_items_order_id",
        table_name="order_items",
    )
    op.drop_table("order_items")

    op.drop_index(
        "ix_orders_status",
        table_name="orders",
    )
    op.drop_table("orders")

    op.drop_index(
        "ix_recipes_item_id",
        table_name="recipes",
    )
    op.drop_table("recipes")

    op.drop_index(
        "ix_items_category",
        table_name="items",
    )
    op.drop_index(
        "ix_items_code",
        table_name="items",
    )
    op.drop_table("items")

    op.drop_index(
        "ix_sessions_session_token",
        table_name="sessions",
    )
    op.drop_table("sessions")

    op.drop_index(
        "ix_users_discord_id",
        table_name="users",
    )
    op.drop_table("users")