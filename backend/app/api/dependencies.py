from dataclasses import dataclass

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.db import get_db
from app.core.security import is_session_expired
from app.models.session import Session
from app.models.user import User


@dataclass(frozen=True)
class Principal:
    session: Session
    user: User

    @property
    def role(self) -> str:
        return self.user.role

    @property
    def actor_id(self) -> str:
        return self.user.discord_id or self.user.id

    @property
    def is_admin(self) -> bool:
        return self.user.role == "admin"


async def _load_principal(
    db: AsyncSession,
    session_token: str | None,
) -> Principal | None:
    if not session_token:
        return None

    result = await db.execute(
        select(Session)
        .options(selectinload(Session.user))
        .where(Session.session_token == session_token)
    )

    session = result.scalar_one_or_none()

    if session is None:
        return None

    if is_session_expired(session.expires_at):
        await db.delete(session)
        await db.flush()
        return None

    if session.user is None:
        return None

    return Principal(
        session=session,
        user=session.user,
    )


async def get_optional_principal(
    db: AsyncSession = Depends(get_db),
    session_token: str | None = Cookie(
        default=None,
        alias=settings.session_cookie_name,
    ),
) -> Principal | None:
    return await _load_principal(db, session_token)


async def get_current_principal(
    principal: Principal | None = Depends(get_optional_principal),
) -> Principal:
    if principal is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    return principal