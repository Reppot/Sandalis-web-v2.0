from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import Principal
from app.models.timer import Timer
from app.schemas.timers import CreateTimerRequest
from app.services.errors import EntityNotFoundError


def current_timestamp_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


class TimerService:
    async def list_all(
        self,
        db: AsyncSession,
        principal: Principal,
    ) -> list[Timer]:
        result = await db.execute(
            select(Timer).order_by(Timer.target_timestamp.asc())
        )

        return list(result.scalars().all())

    async def create(
        self,
        db: AsyncSession,
        principal: Principal,
        payload: CreateTimerRequest,
    ) -> Timer:
        timer = Timer(
            name=payload.name,
            type=payload.type,
            duration_seconds=payload.duration_seconds,
            target_timestamp=(
                current_timestamp_ms()
                + payload.duration_seconds * 1000
            ),
            created_by=principal.actor_id,
        )

        db.add(timer)
        await db.flush()

        return timer

    async def reset(
        self,
        db: AsyncSession,
        principal: Principal,
        timer_id: str,
    ) -> Timer:
        timer = await self._get_by_id(db, timer_id)

        timer.target_timestamp = (
            current_timestamp_ms()
            + timer.duration_seconds * 1000
        )

        await db.flush()
        return timer

    async def delete(
        self,
        db: AsyncSession,
        principal: Principal,
        timer_id: str,
    ) -> None:
        timer = await self._get_by_id(db, timer_id)

        await db.delete(timer)
        await db.flush()

    async def _get_by_id(
        self,
        db: AsyncSession,
        timer_id: str,
    ) -> Timer:
        result = await db.execute(
            select(Timer).where(Timer.id == timer_id)
        )

        timer = result.scalar_one_or_none()

        if timer is None:
            raise EntityNotFoundError("Timer not found")

        return timer


timer_service = TimerService()