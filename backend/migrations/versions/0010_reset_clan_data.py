"""Одноразовая очистка: начать с реальных данных

По решению владельца сайта (2026-10-21) удаляются все данные кланов, накопленные
при разработке и тестах: кланы и их настройки (привязка к Discord, вебхук, роли),
участники и профили пользователей, API-токены, приглашения, склады и содержимое,
таймеры и журналы, рапорты и заказы.

Справочники остаются: catalog_items, production_recipes, app_content.
Действующие сессии отзываются отдельно (TOKEN_GENERATION в app/core/security.py).

Revision ID: 0010_reset_clan_data
Revises: 0009_discord_role_custom
Create Date: 2026-10-21
"""
from __future__ import annotations

from alembic import op

revision = "0010_reset_clan_data"
down_revision = "0009_discord_role_custom"
branch_labels = None
depends_on = None

CLAN_TABLES = (
    "stockpile_items", "stockpiles", "timer_events", "timers",
    "order_report_lines", "order_reports", "orders",
    "clan_api_tokens", "clan_invite_codes", "clan_settings", "clan_memberships",
    "users", "clans",
)


def upgrade() -> None:
    op.execute(f"TRUNCATE TABLE {', '.join(CLAN_TABLES)} RESTART IDENTITY CASCADE")


def downgrade() -> None:
    # удалённые данные не восстанавливаются
    pass
