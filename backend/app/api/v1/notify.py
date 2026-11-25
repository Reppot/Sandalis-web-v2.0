"""Уведомления вне сайта (/notify): ЛС Discord по согласию и Web Push в браузер."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select

from app.api.deps import CurrentPrincipal, DbDep
from app.core.config import settings
from app.core.errors import NotFoundError
from app.core.push_endpoint import is_allowed_push_endpoint
from app.core.tenancy import bypass_clan_filter
from app.models.push import PushSubscription
from app.models.rbac import User
from app.services import discord_bot
from app.services.notify_dispatch import push_enabled

router = APIRouter(prefix="/notify", tags=["notify"])


class NotifyState(BaseModel):
    dm: bool
    dm_available: bool          # бот клана настроен
    push_key: str | None        # публичный ключ VAPID (нет — push выключен на сервере)
    push_devices: int


class NotifyPrefs(BaseModel):
    dm: bool


class PushKeys(BaseModel):
    p256dh: Annotated[str, Field(min_length=10, max_length=200)]
    auth: Annotated[str, Field(min_length=4, max_length=100)]


class PushSubscribe(BaseModel):
    endpoint: Annotated[str, Field(min_length=10, max_length=600)]
    keys: PushKeys

    @field_validator("endpoint")
    @classmethod
    def _trusted_push_service(cls, value: str) -> str:
        if not is_allowed_push_endpoint(value):
            raise ValueError("unsupported push service endpoint")
        return value


class PushUnsubscribe(BaseModel):
    endpoint: Annotated[str, Field(min_length=10, max_length=600)]


async def _user(principal: CurrentPrincipal, session: DbDep) -> User:
    if principal.subject_type != "user":
        raise NotFoundError()
    user = await session.get(User, principal.user_id)
    if user is None:
        raise NotFoundError()
    return user


async def _state(user: User, session: DbDep) -> NotifyState:
    with bypass_clan_filter():
        n = len((await session.execute(select(PushSubscription.id).where(PushSubscription.user_id == user.id))).all())
    return NotifyState(dm=user.notify_dm, dm_available=discord_bot.enabled(),
                       push_key=settings.VAPID_PUBLIC_KEY if push_enabled() else None, push_devices=n)


@router.get("", response_model=NotifyState, summary="Мои уведомления вне сайта")
async def read_state(principal: CurrentPrincipal, session: DbDep) -> NotifyState:
    return await _state(await _user(principal, session), session)


@router.put("", response_model=NotifyState, summary="Дублировать почту сайта в ЛС Discord")
async def save_prefs(payload: NotifyPrefs, principal: CurrentPrincipal, session: DbDep) -> NotifyState:
    user = await _user(principal, session)
    user.notify_dm = payload.dm
    await session.commit()
    return await _state(user, session)


@router.post("/push", response_model=NotifyState, summary="Подписать этот браузер на push")
async def subscribe(payload: PushSubscribe, principal: CurrentPrincipal, session: DbDep) -> NotifyState:
    user = await _user(principal, session)
    with bypass_clan_filter():
        await session.execute(delete(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
        session.add(PushSubscription(user_id=user.id, endpoint=payload.endpoint, p256dh=payload.keys.p256dh, auth=payload.keys.auth))
        await session.commit()
    return await _state(user, session)


@router.post("/push/remove", status_code=status.HTTP_204_NO_CONTENT, summary="Отписать этот браузер")
async def unsubscribe(payload: PushUnsubscribe, principal: CurrentPrincipal, session: DbDep) -> Response:
    user = await _user(principal, session)
    with bypass_clan_filter():
        await session.execute(delete(PushSubscription).where(PushSubscription.endpoint == payload.endpoint,
                                                             PushSubscription.user_id == user.id))
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
