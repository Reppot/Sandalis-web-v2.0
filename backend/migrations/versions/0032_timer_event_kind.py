"""Журнал таймера: структурированные записи (вид, кто, сколько оставалось) — для очков снабжения

Revision ID: 0032_timer_event_kind
Revises: 0031_hidden_roles
Create Date: 2026-10-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0032_timer_event_kind"
down_revision = "0031_hidden_roles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("timer_events", sa.Column("kind", sa.String(16), nullable=True))
    op.add_column("timer_events", sa.Column("user_id", sa.String(64), nullable=True))
    op.add_column("timer_events", sa.Column("left_sec", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("timer_events", "left_sec")
    op.drop_column("timer_events", "user_id")
    op.drop_column("timer_events", "kind")
