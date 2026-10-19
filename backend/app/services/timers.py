from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal, Sequence

from sqlalchemy import select

from app.core.errors import ConflictError
from app.domain.timers.calculations import DEFAULT_DURATION_SECONDS, from_timestamp_ms
from app.models.stockpile import Stockpile
from app.models.timer import Timer, TimerEvent
from app.schemas.timer import TimerCreate, TimerEventCreate, TimerUpdate
from app.services.base import ClanScopedService

DOMAIN = "timers"
TimerState = Literal["active", "expired", "completed"]


class TimerService(ClanScopedService):
    # ---------------- read ------------------------------------------------- #
    async def list_timers(
        self,
        *,
        state: TimerState | None = None,
        stockpile_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[Sequence[Timer], int]:
        now = datetime.now(UTC)
        stmt = self._scoped(select(Timer), Timer)
        if state == "active":
            stmt = stmt.where(Timer.completed_at.is_(None), Timer.ends_at > now)
        elif state == "expired":
            stmt = stmt.where(Timer.completed_at.is_(None), Timer.ends_at <= now)
        elif state == "completed":
            stmt = stmt.where(Timer.completed_at.is_not(None))
        if stockpile_id is not None:
            stmt = stmt.where(Timer.stockpile_id == stockpile_id)

        total = await self._count(stmt)
        rows = (
            await self.session.execute(
                stmt.order_by(Timer.ends_at.asc()).limit(min(limit, 200)).offset(offset)
            )
        ).scalars().all()
        return rows, total

    async def get_timer(self, timer_id: uuid.UUID) -> Timer:
        return await self._get_scoped(
            Timer, timer_id, not_found_key="timer.not_found", domain=DOMAIN
        )

    # ---------------- write ------------------------------------------------ #
    async def create_timer(self, payload: TimerCreate) -> tuple[Timer, str]:
        now = datetime.now(UTC)

        if payload.ends_at is not None:
            # современный путь: aware ends_at, старт — сейчас, окно должно быть в будущем
            if payload.ends_at <= now:
                raise ConflictError(message_key="timer.invalid_window", domain=DOMAIN)
            starts_at = now
            ends_at = payload.ends_at
            duration = (
                payload.duration_seconds
                if payload.duration_seconds is not None
                else int((ends_at - starts_at).total_seconds())
            )
        else:
            # legacy-путь старого API: target_timestamp (мс) + duration_seconds;
            # истекшие таймеры создавать можно (честный перенос поведения)
            assert payload.target_timestamp is not None
            duration = payload.duration_seconds or DEFAULT_DURATION_SECONDS
            ends_at = from_timestamp_ms(payload.target_timestamp)
            starts_at = ends_at - timedelta(seconds=duration)

        if payload.stockpile_id is not None:
            await self._get_scoped(
                Stockpile, payload.stockpile_id,
                not_found_key="timer.stockpile_missing", domain=DOMAIN,
            )

        timer = Timer(
            title=payload.title,
            kind=payload.kind.value,
            note=payload.note,
            stockpile_id=payload.stockpile_id,
            starts_at=starts_at,
            ends_at=ends_at,
            duration_seconds=duration,
            created_by=self.principal.user_id,
        )
        self.session.add(timer)
        await self.session.flush()
        self._log(timer, self.t.t("timer.log.created", domain=DOMAIN, ends=_fmt(ends_at)))
        await self.session.commit()
        await self.session.refresh(timer)
        return timer, self.t.t("timer.created", domain=DOMAIN, title=timer.title)

    async def update_timer(
        self, timer_id: uuid.UUID, payload: TimerUpdate
    ) -> tuple[Timer, str]:
        timer = await self._get_scoped(
            Timer, timer_id, not_found_key="timer.not_found", domain=DOMAIN,
            for_update=True,
        )
        now = datetime.now(UTC)
        message_key = "timer.updated"

        fields = payload.model_dump(exclude_unset=True)
        restart = fields.pop("restart", None)
        restart_duration = fields.pop("duration_seconds", None)
        if restart:
            duration = restart_duration or timer.duration_seconds
            timer.starts_at = now
            timer.ends_at = now + timedelta(seconds=duration)
            timer.duration_seconds = duration
            timer.completed_at = None
            message_key = "timer.restarted"
            self._log(timer, self.t.t("timer.log.restarted", domain=DOMAIN,
                                      duration=_fmt_duration(duration)))

        new_ends = fields.pop("ends_at", None)
        if new_ends is not None:
            if new_ends <= timer.starts_at:
                raise ConflictError(
                    message_key="timer.invalid_window", domain=DOMAIN
                )
            timer.ends_at = new_ends
            timer.duration_seconds = int((new_ends - timer.starts_at).total_seconds())

        kind = fields.pop("kind", None)
        if kind is not None:
            timer.kind = kind.value

        stockpile_id = fields.pop("stockpile_id", None)
        if stockpile_id is not None:
            await self._get_scoped(
                Stockpile, stockpile_id,
                not_found_key="timer.stockpile_missing", domain=DOMAIN,
            )
            timer.stockpile_id = stockpile_id

        completed = fields.pop("completed", None)
        if completed is True:
            timer.completed_at = now
            message_key = "timer.completed"
            self._log(timer, self.t.t("timer.log.completed", domain=DOMAIN))
        elif completed is False and not restart:
            timer.completed_at = None
            message_key = "timer.reopened"
            self._log(timer, self.t.t("timer.log.reopened", domain=DOMAIN))

        for field, value in fields.items():   # title, note
            setattr(timer, field, value)

        await self.session.commit()
        await self.session.refresh(timer)
        return timer, self.t.t(message_key, domain=DOMAIN, title=timer.title)

    async def delete_timer(self, timer_id: uuid.UUID) -> None:
        timer = await self._get_scoped(
            Timer, timer_id, not_found_key="timer.not_found", domain=DOMAIN
        )
        await self.session.delete(timer)
        await self.session.commit()

    # ---------------- журнал --------------------------------------------- #
    def _log(self, timer: Timer, message: str) -> None:
        self.session.add(
            TimerEvent(timer_id=timer.id, message=message, created_by=self._author())
        )

    def _author(self) -> str:
        return (self.principal.display_name or self.principal.user_id)[:64]

    async def list_events(self, timer_id: uuid.UUID, *, limit: int = 100) -> Sequence[TimerEvent]:
        timer = await self.get_timer(timer_id)
        stmt = (
            self._scoped(select(TimerEvent), TimerEvent)
            .where(TimerEvent.timer_id == timer.id)
            .order_by(TimerEvent.created_at.desc())
            .limit(min(limit, 500))
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        return list(reversed(rows))   # хронологически, как консоль журнала

    async def add_event(
        self, timer_id: uuid.UUID, payload: TimerEventCreate
    ) -> tuple[TimerEvent, str]:
        timer = await self.get_timer(timer_id)
        event = TimerEvent(timer_id=timer.id, message=payload.message, created_by=self._author())
        self.session.add(event)
        await self.session.commit()
        await self.session.refresh(event)
        return event, self.t.t("timer.note_added", domain=DOMAIN)


def _fmt(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%d.%m %H:%M UTC")


def _fmt_duration(seconds: int) -> str:
    """Нейтральный к языку формат «48:00» (часы:минуты) — подставляется в локализованную фразу."""
    hours, rest = divmod(seconds, 3600)
    return f"{hours}:{rest // 60:02d}"
