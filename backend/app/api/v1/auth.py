from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.db import get_session

router = APIRouter()


@router.post("/login")
async def login(token: str, response: Response, s: AsyncSession = Depends(get_session)):
    user_id = security.match_access_token(token)  # пароль клана → профиль
    if user_id is None:
        return Response(status_code=401)
    await security.create_session(response, user_id, s)
    return {"ok": True}


@router.get("/discord/authorize")
def discord_authorize() -> dict[str, str]:
    return {"authorize_url": security.discord_authorize_url()}


@router.post("/discord/callback")
async def discord_callback(code: str, response: Response, s: AsyncSession = Depends(get_session)):
    user_id = await security.exchange_code(s, code)  # код → профиль гильдии
    await security.create_session(response, user_id, s)
    return {"ok": True}


@router.get("/me")
async def me(user_id: int = Depends(security.current_user_id)):
    return {"user_id": user_id}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(security.COOKIE)
    return {"ok": True}
