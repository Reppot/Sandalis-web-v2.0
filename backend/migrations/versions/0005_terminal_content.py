"""terminal content: рецепты, рапорты, журнал таймеров, контент, настройки клана

Перенос инструментов старого сайта (Reppot/Sandalis-Web) на бэкенд — фронтенд
и будущий десктоп-клиент больше не держат номенклатуру и контент статикой:
  * catalog_items: faction/origin/aliases/needs_review (реестр кодов старого сайта);
  * production_recipes — глобальные рецепты Factory/MPF/Refinery;
  * app_content — глобальный реестр контента (медиа, ссылки, обучение, фразы…);
  * order_reports + order_report_lines — многострочные рапорты снабжения (clan-scoped);
  * timer_events — журнал таймера (clan-scoped);
  * clan_settings — вебхук Discord и прочие настройки клана;
  * stockpiles.last_sync_source/last_sync_at — монитор содержимого склада.

Данные заливает `python -m app.seed` (идемпотентно), не миграция.

Revision ID: 0005_terminal_content
Revises: 0004_discord_oauth
Create Date: 2026-10-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005_terminal_content"
down_revision = "0004_discord_oauth"
branch_labels = None
depends_on = None

JSONB = postgresql.JSONB(astext_type=sa.Text())


def _ts() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    ]


def _uuid_pk() -> sa.Column:
    return sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                     server_default=sa.text("gen_random_uuid()"))


def _clan_fk() -> sa.Column:
    return sa.Column("clan_id", sa.String(64),
                     sa.ForeignKey("clans.id", ondelete="CASCADE"), nullable=False)


def upgrade() -> None:
    # --- catalog_items: реестр кодов -------------------------------------------
    op.add_column("catalog_items", sa.Column(
        "faction", sa.String(16), server_default="neutral", nullable=False))
    op.add_column("catalog_items", sa.Column("origin", sa.String(16), nullable=True))
    op.add_column("catalog_items", sa.Column(
        "aliases", JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False))
    op.add_column("catalog_items", sa.Column(
        "needs_review", sa.Boolean(), server_default=sa.text("false"), nullable=False))

    # --- stockpiles: монитор содержимого ----------------------------------------
    op.add_column("stockpiles", sa.Column("last_sync_source", sa.String(16), nullable=True))
    op.add_column("stockpiles", sa.Column(
        "last_sync_at", sa.DateTime(timezone=True), nullable=True))

    # --- production_recipes (глобально) ------------------------------------------
    op.create_table(
        "production_recipes",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("name_en", sa.String(160), nullable=True),
        sa.Column("item_code", sa.String(64), nullable=True),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("item_class", sa.String(64), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("factions", JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("facilities", JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("icon_url", sa.String(512), nullable=True),
        sa.Column("output_quantity", sa.Integer(), server_default="1", nullable=False),
        sa.Column("cost", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("data", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("sort", sa.Integer(), server_default="0", nullable=False),
        *_ts(),
    )
    op.create_index("ix_production_recipes_kind_sort", "production_recipes", ["kind", "sort"])

    # --- app_content (глобально) -------------------------------------------------
    op.create_table(
        "app_content",
        _uuid_pk(),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("key", sa.String(64), nullable=False),
        sa.Column("sort", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("payload", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        *_ts(),
        sa.UniqueConstraint("kind", "key", name="uq_app_content_kind_key"),
    )
    op.create_index("ix_app_content_kind_sort", "app_content", ["kind", "sort"])

    # --- order_reports + lines (clan-scoped) -------------------------------------
    op.create_table(
        "order_reports",
        _uuid_pk(),
        _clan_fk(),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("status", sa.String(16), server_default="open", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("meta", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_by", sa.String(64), nullable=False),
        sa.Column("created_by_name", sa.String(120), nullable=True),
        sa.Column("discord_sent_at", sa.DateTime(timezone=True), nullable=True),
        *_ts(),
        sa.CheckConstraint(
            "status IN ('open', 'in_progress', 'done', 'cancelled')",
            name="status_known",
        ),
    )
    op.create_index("ix_order_reports_clan_id", "order_reports", ["clan_id"])
    op.create_index("ix_order_reports_clan_status_created", "order_reports",
                    ["clan_id", "status", "created_at"])

    op.create_table(
        "order_report_lines",
        _uuid_pk(),
        _clan_fk(),
        sa.Column("report_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("order_reports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("item_code", sa.String(64), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit", sa.String(8), server_default="crate", nullable=False),
        sa.CheckConstraint("quantity > 0", name="quantity_positive"),
        sa.CheckConstraint("unit IN ('crate', 'unit')", name="unit_known"),
    )
    op.create_index("ix_order_report_lines_clan_id", "order_report_lines", ["clan_id"])
    op.create_index("ix_order_report_lines_clan_report", "order_report_lines",
                    ["clan_id", "report_id"])

    # --- timer_events (clan-scoped) ----------------------------------------------
    op.create_table(
        "timer_events",
        _uuid_pk(),
        _clan_fk(),
        sa.Column("timer_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("timers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_timer_events_clan_id", "timer_events", ["clan_id"])
    op.create_index("ix_timer_events_clan_timer_created", "timer_events",
                    ["clan_id", "timer_id", "created_at"])

    # --- clan_settings (clan-scoped, 1 строка на клан) ---------------------------
    op.create_table(
        "clan_settings",
        _uuid_pk(),
        _clan_fk(),
        sa.Column("discord_webhook_url", sa.String(512), nullable=True),
        *_ts(),
        sa.UniqueConstraint("clan_id", name="uq_clan_settings_clan_id"),
    )
    op.create_index("ix_clan_settings_clan_id", "clan_settings", ["clan_id"])


def downgrade() -> None:
    op.drop_table("clan_settings")
    op.drop_table("timer_events")
    op.drop_table("order_report_lines")
    op.drop_table("order_reports")
    op.drop_table("app_content")
    op.drop_table("production_recipes")
    op.drop_column("stockpiles", "last_sync_at")
    op.drop_column("stockpiles", "last_sync_source")
    op.drop_column("catalog_items", "needs_review")
    op.drop_column("catalog_items", "aliases")
    op.drop_column("catalog_items", "origin")
    op.drop_column("catalog_items", "faction")
