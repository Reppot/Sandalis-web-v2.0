"""Бегущая строка: убрать шуточные фразы штаба (лента показывает только склады)

Revision ID: 0040_drop_ticker_phrases
Revises: 0039_operation_plan
Create Date: 2026-10-29
"""
from __future__ import annotations

from alembic import op

revision = "0040_drop_ticker_phrases"
down_revision = "0039_operation_plan"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM app_content WHERE kind = 'ticker_phrase'")


def downgrade() -> None:
    pass
