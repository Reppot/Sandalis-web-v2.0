from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import Principal, get_current_principal
from app.core.db import get_db
from app.models.timer import Timer
from app.schemas.timers import CreateTimerRequest, TimerResponse
from app.services.errors import EntityNotFoundError
from app.services.timers import timer_service


router = APIRouter(
    prefix="/timers",
    tags=["timers"],
)


def _serialize_timer(timer: Timer) -> TimerResponse:
    return TimerResponse(
        id=timer.id,
        name=timer.name,
        type=timer.type,
        target_timestamp=timer.target_timestamp,
        duration_seconds=timer.duration_seconds,
        created_at=timer.created_at,
        updated_at=timer.updated_at,
    )


def _not_found(exc: EntityNotFoundError) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail=str(exc),
    )


@router.get("", response_model=list[TimerResponse])
async def list_timers(
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> list[TimerResponse]:
    timers = await timer_service.list_all(
        db=db,
        principal=principal,
    )

    return [_serialize_timer(timer) for timer in timers]


@router.post(
    "",
    response_model=TimerResponse,
    status_code=201,
)
async def create_timer(
    payload: CreateTimerRequest,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> TimerResponse:
    timer = await timer_service.create(
        db=db,
        principal=principal,
        payload=payload,
    )

    return _serialize_timer(timer)


@router.post(
    "/{timer_id}/reset",
    response_model=TimerResponse,
)
async def reset_timer(
    timer_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> TimerResponse:
    try:
        timer = await timer_service.reset(
            db=db,
            principal=principal,
            timer_id=timer_id,
        )
    except EntityNotFoundError as exc:
        raise _not_found(exc) from exc

    return _serialize_timer(timer)


@router.delete(
    "/{timer_id}",
    status_code=204,
)
async def delete_timer(
    timer_id: str,
    db: AsyncSession = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
) -> Response:
    try:
        await timer_service.delete(
            db=db,
            principal=principal,
            timer_id=timer_id,
        )
    except EntityNotFoundError as exc:
        raise _not_found(exc) from exc

    return Response(status_code=204)