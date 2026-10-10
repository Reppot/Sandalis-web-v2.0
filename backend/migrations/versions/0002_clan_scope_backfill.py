"""clan_id backfill для СУЩЕСТВУЮЩИХ (legacy) баз

Эталонная миграция апгрейда «живого» проекта на мультиарендность:
nullable -> backfill -> NOT NULL, без длительной эксклюзивной блокировки.
Все операции защищены инспектором, поэтому на свежей БД (после 0001)
миграция является no-op.

Revision ID: 0002_clan_scope_backfill
Revises: 0001_initial
Create Date: 2024-06-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_clan_scope_backfill"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

# вписать сюда ВСЕ legacy-таблицы аренды (orders/stockpiles/timers/items/...)
CLAN_SCOPED_TABLES = (
    "orders",
    "stockpiles",
    "stockpile_items",
    "timers",
    "items",
)
LEGACY_CLAN_ID = "legacy"


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "clans" not in tables:  # legacy-БД: реестра арендаторов ещё нет
        op.create_table(
            "clans",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("default_locale", sa.String(8),
                      server_default="en", nullable=False),
            sa.Column("is_active", sa.Boolean(),
                      server_default=sa.true(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True),
                      server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True),
                      server_default=sa.func.now(), nullable=False),
        )

    op.execute(
        sa.text("INSERT INTO clans (id, name) VALUES (:id, :name) ON CONFLICT DO NOTHING")
        .bindparams(id=LEGACY_CLAN_ID, name="Legacy clan")
    )

    for table in CLAN_SCOPED_TABLES:
        if table not in tables:
            continue  # таблицы нет (свежая БД или этот модуль ещё не выкачан)
        columns = {c["name"] for c in insp.get_columns(table)}
        if "clan_id" in columns:
            continue  # уже размечено в 0001 или ранее

        # 1) nullable -> 2) backfill -> 3) NOT NULL
        op.add_column(table, sa.Column("clan_id", sa.String(64), nullable=True))
        op.execute(
            sa.text(f"UPDATE {table} SET clan_id = :clan WHERE clan_id IS NULL")
            .bindparams(clan=LEGACY_CLAN_ID)
        )
        op.alter_column(table, "clan_id", nullable=False)
        op.create_index(f"ix_{table}_clan_id", table, ["clan_id"])
        op.create_foreign_key(
            f"fk_{table}_clan_id_clans", table, "clans",
            ["clan_id"], ["id"], ondelete="CASCADE",
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    for table in CLAN_SCOPED_TABLES:
        if table not in tables:
            continue
        columns = {c["name"] for c in insp.get_columns(table)}
        if "clan_id" not in columns:
            continue
        fks = {fk["name"] for fk in insp.get_foreign_keys(table)}
        if f"fk_{table}_clan_id_clans" in fks:
            op.drop_constraint(f"fk_{table}_clan_id_clans", table, type_="foreignkey")
        indexes = {ix["name"] for ix in insp.get_indexes(table)}
        if f"ix_{table}_clan_id" in indexes:
            op.drop_index(f"ix_{table}_clan_id", table_name=table)
        op.drop_column(table, "clan_id")
