"""Курсы клана (/clan/courses) для раздела «Обучение»: читают участники клана (гостю — пусто),
создают, правят, удаляют и переставляют те, у кого есть право clan:content (командир, высокий доступ)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import func, select

from app.api.deps import CurrentPrincipal, DbDep, PermissionChecker
from app.core.errors import AppError, NotFoundError
from app.core.permissions import Scopes
from app.core.security import Principal
from app.models.course import ClanCourse
from app.schemas.course import ClanCourseList, ClanCourseOrder, ClanCourseRead, ClanCourseWrite

router = APIRouter(prefix="/clan/courses", tags=["clan"])
CanEdit = [Depends(PermissionChecker([Scopes.CLAN_CONTENT]))]

MAX_COURSES = 50


def _can_edit(principal: Principal) -> bool:
    return principal.subject_type != "guest" and principal.can(Scopes.CLAN_CONTENT)


async def _get(session: DbDep, course_id: uuid.UUID) -> ClanCourse:
    row = (await session.execute(select(ClanCourse).where(ClanCourse.id == course_id))).scalar_one_or_none()
    if row is None:
        raise NotFoundError()
    return row


@router.get("", response_model=ClanCourseList, summary="Курсы своего клана")
async def list_courses(principal: CurrentPrincipal, session: DbDep) -> ClanCourseList:
    rows = [] if principal.subject_type == "guest" else (await session.execute(
        select(ClanCourse).order_by(ClanCourse.sort, ClanCourse.created_at)
    )).scalars().all()
    return ClanCourseList(can_edit=_can_edit(principal), max_courses=MAX_COURSES,
                          courses=[ClanCourseRead.model_validate(r) for r in rows])


@router.post("", response_model=ClanCourseRead, status_code=status.HTTP_201_CREATED, dependencies=CanEdit,
             summary="Новый курс клана")
async def create_course(payload: ClanCourseWrite, principal: CurrentPrincipal, session: DbDep) -> ClanCourseRead:
    count = (await session.execute(select(func.count()).select_from(ClanCourse))).scalar_one()
    if count >= MAX_COURSES:
        raise AppError(message_key="errors.courses_too_many", code="validation_error", status_code=422,
                       params={"n": MAX_COURSES})
    last = (await session.execute(select(func.max(ClanCourse.sort)))).scalar_one()
    row = ClanCourse(
        title=payload.title, summary=payload.summary, body=payload.body, sort=(last or 0) + 1,
        author_id=principal.user_id, author_name=(principal.display_name or principal.user_id)[:120],
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return ClanCourseRead.model_validate(row)


@router.put("/{course_id}", response_model=ClanCourseRead, dependencies=CanEdit, summary="Изменить курс клана")
async def update_course(course_id: uuid.UUID, payload: ClanCourseWrite, session: DbDep) -> ClanCourseRead:
    row = await _get(session, course_id)
    row.title, row.summary, row.body = payload.title, payload.summary, payload.body
    await session.commit()
    await session.refresh(row)
    return ClanCourseRead.model_validate(row)


@router.put("", response_model=ClanCourseList, dependencies=CanEdit, summary="Порядок курсов клана")
async def reorder_courses(payload: ClanCourseOrder, principal: CurrentPrincipal, session: DbDep) -> ClanCourseList:
    rows = {r.id: r for r in (await session.execute(select(ClanCourse))).scalars().all()}
    for i, cid in enumerate(payload.ids):
        if cid in rows:
            rows[cid].sort = i + 1
    await session.commit()
    return await list_courses(principal, session)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=CanEdit,
               summary="Удалить курс клана")
async def delete_course(course_id: uuid.UUID, session: DbDep) -> Response:
    await session.delete(await _get(session, course_id))
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
