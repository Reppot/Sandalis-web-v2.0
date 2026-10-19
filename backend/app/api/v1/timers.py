from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import (
    ClanSession,
    CurrentPrincipal,
    PermissionChecker,
    domain_translator,
)
from app.core.i18n import Translator
from app.core.permissions import Scopes
from app.schemas.common import Page
from app.schemas.timer import (
    TimerCreate,
    TimerCreated,
    TimerEventCreate,
    TimerEventRead,
    TimerEventSaved,
    TimerRead,
    TimerUpdate,
)
from app.services.timers import TimerService

router = APIRouter(prefix="/timers", tags=["timers"])

TimersTranslator = Annotated[Translator, Depends(domain_translator("timers"))]


async def get_timer_service(
    session: ClanSession,
    principal: CurrentPrincipal,
    translator: TimersTranslator,
) -> TimerService:
    return TimerService(session, principal, translator)


ServiceDep = Annotated[TimerService, Depends(get_timer_service)]


@router.get(
    "",
    response_model=Page[TimerRead],
    summary="Таймеры текущего клана (ближайшие дедлайны первыми)",
    dependencies=[Depends(PermissionChecker([Scopes.TIMERS_READ]))],
)
async def list_timers(
    service: ServiceDep,
    state: Annotated[Literal["active", "expired", "completed"] | None, Query()] = None,
    stockpile_id: Annotated[uuid.UUID | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[TimerRead]:
    rows, total = await service.list_timers(
        state=state, stockpile_id=stockpile_id, limit=limit, offset=offset
    )
    return Page[TimerRead](
        items=[TimerRead.from_model(r) for r in rows],
        total=total, limit=limit, offset=offset,
    )


@router.post(
    "",
    response_model=TimerCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Создать таймер (ends_at ISO-8601 или legacy target_timestamp мс)",
    dependencies=[Depends(PermissionChecker([Scopes.TIMERS_WRITE]))],  # officer+
)
async def create_timer(payload: TimerCreate, service: ServiceDep) -> TimerCreated:
    timer, message = await service.create_timer(payload)
    return TimerCreated(timer=TimerRead.from_model(timer), message=message)


@router.get(
    "/{timer_id}",
    response_model=TimerRead,
    dependencies=[Depends(PermissionChecker([Scopes.TIMERS_READ]))],
)
async def get_timer(timer_id: uuid.UUID, service: ServiceDep) -> TimerRead:
    return TimerRead.from_model(await service.get_timer(timer_id))


@router.patch(
    "/{timer_id}",
    response_model=TimerCreated,
    dependencies=[Depends(PermissionChecker([Scopes.TIMERS_WRITE]))],
)
async def update_timer(
    timer_id: uuid.UUID, payload: TimerUpdate, service: ServiceDep
) -> TimerCreated:
    timer, message = await service.update_timer(timer_id, payload)
    return TimerCreated(timer=TimerRead.from_model(timer), message=message)


@router.delete(
    "/{timer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(PermissionChecker([Scopes.TIMERS_WRITE]))],
)
async def delete_timer(timer_id: uuid.UUID, service: ServiceDep) -> Response:
    await service.delete_timer(timer_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------- журнал таймера --------------------------------------------- #
@router.get(
    "/{timer_id}/events",
    response_model=list[TimerEventRead],
    summary="Журнал таймера: заметки и системные записи (хронологически)",
    dependencies=[Depends(PermissionChecker([Scopes.TIMERS_READ]))],
)
async def list_events(
    timer_id: uuid.UUID,
    service: ServiceDep,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[TimerEventRead]:
    return [TimerEventRead.model_validate(e) for e in await service.list_events(timer_id, limit=limit)]


@router.post(
    "/{timer_id}/events",
    response_model=TimerEventSaved,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить заметку интенданта в журнал таймера",
    dependencies=[Depends(PermissionChecker([Scopes.TIMERS_WRITE]))],
)
async def add_event(
    timer_id: uuid.UUID, payload: TimerEventCreate, service: ServiceDep
) -> TimerEventSaved:
    event, message = await service.add_event(timer_id, payload)
    return TimerEventSaved(event=TimerEventRead.model_validate(event), message=message)
