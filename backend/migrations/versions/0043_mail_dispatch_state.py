"""Track successful external notification channels separately."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0043_mail_dispatch_state"
down_revision = "0042_clan_plan_rsvp"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "clan_mail",
        sa.Column(
            "dispatch_state",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("clan_mail", "dispatch_state")
