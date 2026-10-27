"""Почта на сайте (/mail) и роли для упоминаний (/clan/mentions).

Письма приходят, когда в заметке операции упоминают «@роль»: каждому участнику клана с этой
ролью Discord. Читает и чистит свою почту только получатель."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlalchemy import func, select, update

from app.api.deps import CurrentPrincipal, DbDep
from app.core.errors import NotFoundError
from app.core.permissions import Scopes
from app.models.mail import ClanMail
from app.services.mentions import clan_roles

router = APIRouter(tags=["mail"])
MAX_LIST = 100


class MentionRole(BaseModel):
    id: str
    name: str
    color: int


class MailRead(BaseModel):
    id: uuid.UUID
    kind: str
    sender_name: str
    payload: dict[str, Any]
    read: bool
    created_at: datetime


class MailList(BaseModel):
    unread: int
    items: list[MailRead]


def _member(principal: Any) -> bool:
    return principal.subject_type == "user"


@router.get("/clan/mentions", response_model=list[MentionRole], summary="Роли для упоминания «@» (роли Discord-сервера клана)")
async def mention_roles(principal: CurrentPrincipal, session: DbDep) -> list[MentionRole]:
    if not _member(principal):
        return []
    everyone = principal.can(Scopes.CLAN_EVERYONE)
    return [MentionRole(**r) for r in await clan_roles(session) if everyone or r["id"] != "everyone"]


@router.get("/mail", response_model=MailList, summary="Моя почта на сайте")
async def my_mail(principal: CurrentPrincipal, session: DbDep) -> MailList:
    if not _member(principal):
        return MailList(unread=0, items=[])
    mine = ClanMail.recipient_id == principal.user_id
    rows = (await session.execute(select(ClanMail).where(mine).order_by(ClanMail.created_at.desc()).limit(MAX_LIST))).scalars().all()
    unread = (await session.execute(select(func.count()).select_from(ClanMail).where(mine, ClanMail.read_at.is_(None)))).scalar_one()
    return MailList(unread=unread, items=[
        MailRead(id=r.id, kind=r.kind, sender_name=r.sender_name, payload=r.payload or {}, read=r.read_at is not None, created_at=r.created_at)
        for r in rows
    ])


@router.post("/mail/read", status_code=status.HTTP_204_NO_CONTENT, summary="Отметить всю почту прочитанной")
async def read_all(principal: CurrentPrincipal, session: DbDep) -> Response:
    if _member(principal):
        await session.execute(
            update(ClanMail).where(ClanMail.recipient_id == principal.user_id, ClanMail.read_at.is_(None)).values(read_at=datetime.now(UTC))
        )
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _mine(session: DbDep, principal: Any, mail_id: uuid.UUID) -> ClanMail:
    row = (await session.execute(select(ClanMail).where(ClanMail.id == mail_id))).scalar_one_or_none()
    if row is None or row.recipient_id != principal.user_id:
        raise NotFoundError()
    return row


@router.post("/mail/{mail_id}/read", status_code=status.HTTP_204_NO_CONTENT, summary="Отметить письмо прочитанным")
async def read_one(mail_id: uuid.UUID, principal: CurrentPrincipal, session: DbDep) -> Response:
    row = await _mine(session, principal, mail_id)
    row.read_at = row.read_at or datetime.now(UTC)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/mail/{mail_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить письмо")
async def delete_one(mail_id: uuid.UUID, principal: CurrentPrincipal, session: DbDep) -> Response:
    await session.delete(await _mine(session, principal, mail_id))
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
