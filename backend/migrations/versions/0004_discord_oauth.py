"""discord oauth: users.avatar_url

Возвращаем Discord OAuth (P0). Единственное изменение схемы — профиль Discord
несёт аватар, поэтому users получает nullable avatar_url (String(512)).

Идентичность по-прежнему хранится как User.id = discord_user_id (см. README),
таблица сессий НЕ нужна: state подписывается HMAC и живёт DISCORD_OAUTH_STATE_TTL_SEC,
а сама сессия — stateless JWT в session-cookie.

Revision ID: 0004_discord_oauth
Revises: 0003_domain_modules
Create Date: 2024-06-03
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004_discord_oauth"
down_revision = "0003_domain_modules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_url")
