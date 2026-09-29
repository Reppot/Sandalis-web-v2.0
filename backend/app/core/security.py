from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_session
from app.models.session import Session

COOKIE = "sindaris_session"  # имя cookie сохраняем — фронт не меняется


async def create_session(response: Response, user_id: int, s: AsyncSession) -> None:
    session = Session(
        id=str(uuid4()),
        user_id=user_id,
        expires_at=datetime.now(timezone.utc)
        + timedelta(minutes=settings.session_ttl_min),
    )
    s.add(session)
    await s.commit()
    response.set_cookie(COOKIE, session.id, httponly=True, samesite="lax", secure=True)


async def current_user_id(
    cookie: str | None = None,
    s: AsyncSession = Depends(get_session),
) -> int:
    # проверка сессии — зависимость FastAPI, а не прокси перед каждым рендером:
    # один запрос в Postgres там, где она реально нужна
    ...


def match_access_token(token: str) -> int | None:
    # ACCESS_TOKENS_JSON: токен -> discord_id, как сегодня
    ...
