"""Обратная связь о сайте (/feedback): пишет любой вошедший через Discord участник (не гость),
видит свои сообщения; владелец сайта (Discord ID в FEEDBACK_ADMIN_IDS) читает все — с ником и кланом."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Response, status
from sqlalchemy import func, select

from app.api.deps import CurrentPrincipal, DbDep
from app.core.config import settings
from app.core.errors import AppError, NotFoundError, PermissionDeniedError
from app.core.security import Principal
from app.core.tenancy import bypass_clan_filter
from app.models.feedback import Feedback
from app.models.mail import ClanMail
from app.models.rbac import Clan
from app.schemas.feedback import FeedbackCreate, FeedbackOverview, FeedbackRead, FeedbackReply, FeedbackStatusUpdate

router = APIRouter(prefix="/feedback", tags=["feedback"])

PER_HOUR = 5          # защита от спама: не больше 5 сообщений в час от одного участника
INBOX_LIMIT = 300


def is_admin(principal: Principal) -> bool:
    admins = {x.strip() for x in settings.FEEDBACK_ADMIN_IDS.split(",") if x.strip()}
    return principal.subject_type == "user" and principal.user_id in admins


def can_write(principal: Principal) -> bool:
    # гость — случайный id без ника; ключ клана — бот, а не человек
    return principal.subject_type == "user"


def _require_admin(principal: Principal) -> None:
    if not is_admin(principal):
        raise PermissionDeniedError(message_key="errors.feedback_admin_only", params={})


@router.get("", response_model=FeedbackOverview, summary="Свои сообщения; владельцу сайта — все")
async def overview(principal: CurrentPrincipal, session: DbDep) -> FeedbackOverview:
    with bypass_clan_filter():
        mine = (await session.execute(
            select(Feedback).where(Feedback.user_id == principal.user_id)
            .order_by(Feedback.created_at.desc()).limit(50)
        )).scalars().all()
        admin = is_admin(principal)
        inbox, unread = [], 0
        if admin:
            inbox = (await session.execute(
                select(Feedback).order_by(Feedback.created_at.desc()).limit(INBOX_LIMIT)
            )).scalars().all()
            unread = (await session.execute(
                select(func.count()).select_from(Feedback).where(Feedback.status == "new")
            )).scalar_one()
    return FeedbackOverview(
        is_admin=admin,
        can_write=can_write(principal),
        mine=[FeedbackRead.model_validate(f) for f in mine],
        inbox=[FeedbackRead.model_validate(f) for f in inbox],
        unread=unread,
    )


@router.post("", response_model=FeedbackRead, status_code=status.HTTP_201_CREATED, summary="Отправить обратную связь")
async def create(payload: FeedbackCreate, principal: CurrentPrincipal, session: DbDep) -> FeedbackRead:
    if not can_write(principal):
        raise PermissionDeniedError(message_key="errors.feedback_login_required", params={})
    since = datetime.now(UTC) - timedelta(hours=1)
    with bypass_clan_filter():
        recent = (await session.execute(
            select(func.count()).select_from(Feedback)
            .where(Feedback.user_id == principal.user_id, Feedback.created_at >= since)
        )).scalar_one()
        if recent >= PER_HOUR:
            raise AppError(message_key="errors.feedback_rate_limited", code="rate_limited", status_code=429,
                           params={"n": PER_HOUR})
        clan = await session.get(Clan, principal.clan_id) if principal.clan_id else None
        row = Feedback(
            user_id=principal.user_id,
            user_name=(principal.display_name or principal.user_id)[:120],
            clan_id=principal.clan_id,
            clan_name=clan.name if clan else None,
            category=payload.category,
            message=payload.message,
            page=payload.page,
            status="new",
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
    return FeedbackRead.model_validate(row)


@router.patch("/{feedback_id}", response_model=FeedbackRead, summary="Статус сообщения (владелец сайта)")
async def set_status(feedback_id: uuid.UUID, payload: FeedbackStatusUpdate, principal: CurrentPrincipal, session: DbDep) -> FeedbackRead:
    _require_admin(principal)
    with bypass_clan_filter():
        row = await session.get(Feedback, feedback_id)
        if row is None:
            raise NotFoundError()
        row.status = payload.status
        await session.commit()
        await session.refresh(row)
    return FeedbackRead.model_validate(row)


@router.post("/{feedback_id}/reply", response_model=FeedbackRead, summary="Ответить автору (владелец сайта) — ответ придёт ему в почту")
async def reply(feedback_id: uuid.UUID, payload: FeedbackReply, principal: CurrentPrincipal, session: DbDep) -> FeedbackRead:
    _require_admin(principal)
    with bypass_clan_filter():
        row = await session.get(Feedback, feedback_id)
        if row is None:
            raise NotFoundError()
        row.reply, row.replied_at, row.status = payload.text, datetime.now(UTC), "done"
        session.add(ClanMail(
            clan_id=row.clan_id, recipient_id=row.user_id, sender_id=principal.user_id,
            sender_name=(principal.display_name or principal.user_id)[:120], kind="feedback_reply",
            payload={"feedback_id": str(row.id), "category": row.category, "message": row.message[:500], "reply": payload.text},
        ))
        await session.commit()
        await session.refresh(row)
    return FeedbackRead.model_validate(row)


@router.delete("/{feedback_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить сообщение (владелец сайта)")
async def delete(feedback_id: uuid.UUID, principal: CurrentPrincipal, session: DbDep) -> Response:
    _require_admin(principal)
    with bypass_clan_filter():
        row = await session.get(Feedback, feedback_id)
        if row is None:
            raise NotFoundError()
        await session.delete(row)
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
