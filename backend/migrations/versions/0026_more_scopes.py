"""Новые права: пирамида (смотреть / добавить / изменить / удалить), операции, назначение,
«взять себе», комментарии, коды складов, статистика, курсы, @everyone.

Сохранённые наборы прав (кастомные роли Discord, точечные гранты участников, токены ботов)
получают новые права там, где раньше то же действие давало старое — доступ не меняется.

Revision ID: 0026_more_scopes
Revises: 0025_timer_alerts
Create Date: 2026-10-27
"""
from __future__ import annotations

import json

import sqlalchemy as sa
from alembic import op

revision = "0026_more_scopes"
down_revision = "0025_timer_alerts"
branch_labels = None
depends_on = None

# прежнее право → какие новые давали то же действие
IMPLIES = {
    "stockpiles:read": ("pyramid:read", "stockpiles:codes"),
    "reports:read": ("reports:take", "reports:comment", "clan:stats"),
    "reports:create": ("operations:create",),
    "reports:status": ("reports:assign",),
    "stockpiles:pyramid": ("pyramid:create", "pyramid:edit", "pyramid:delete"),
    "clan:content": ("clan:training", "operations:manage"),
}
REMOVED = {"stockpiles:pyramid"}
# операции и опрос явки раньше были доступны любому участнику
ALWAYS = ("operations:read", "operations:attend")


def _map(scopes: list[str], *, grant: bool) -> list[str]:
    out = set(scopes)
    for s in scopes:
        out.update(IMPLIES.get(s, ()))
    if grant and scopes:
        out.update(ALWAYS)
    return sorted(out - REMOVED)


def upgrade() -> None:
    bind = op.get_bind()
    for table in ("clan_memberships", "clan_api_tokens"):
        cols = ("extra_scopes", "revoked_scopes") if table == "clan_memberships" else ("extra_scopes",)
        rows = bind.execute(sa.text(f"SELECT id, {', '.join(cols)} FROM {table}")).mappings().all()
        for row in rows:
            values = {c: _map(list(row[c] or []), grant=c == "extra_scopes") for c in cols}
            values = {c: v for c, v in values.items() if v != sorted(row[c] or [])}
            if values:
                sets = ", ".join(f"{c} = CAST(:{c} AS jsonb)" for c in values)
                bind.execute(sa.text(f"UPDATE {table} SET {sets} WHERE id = :id"),
                             {"id": row["id"], **{c: json.dumps(v) for c, v in values.items()}})
    rows = bind.execute(sa.text("SELECT id, discord_role_perms FROM clan_settings")).mappings().all()
    for row in rows:
        perms = dict(row["discord_role_perms"] or {})
        mapped = {role: _map(list(scopes or []), grant=True) for role, scopes in perms.items()}
        if mapped != perms:
            bind.execute(sa.text("UPDATE clan_settings SET discord_role_perms = CAST(:p AS jsonb) WHERE id = :id"),
                         {"id": row["id"], "p": json.dumps(mapped)})


def downgrade() -> None:
    # новые права просто перестают проверяться; старое stockpiles:pyramid раскрывается в коде
    pass
