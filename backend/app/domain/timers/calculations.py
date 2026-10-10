"""Расчёты таймеров.

Функции работы с миллисекундными таймстампами и urgency-уровни
перенесены 1:1 из старого backend (git history, commit d3d724b,
app/domain/timers/calculations.py). Поверх добавлены хелперы для
timezone-aware datetime-модели v2 (app/models/timer.py).
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal, Protocol

UrgencyLevel = Literal["normal", "warning", "critical", "expired"]

CRITICAL_THRESHOLD_S = 4 * 3600    # < 4 часов
WARNING_THRESHOLD_S = 12 * 3600    # < 12 часов
DEFAULT_DURATION_SECONDS = 172800  # 48 часов — «стандартный» распад склада


class _TimerLike(Protocol):
    starts_at: datetime
    ends_at: datetime
    completed_at: datetime | None


# --------------------------------------------------------------------------- #
# 1:1 со старым backend (API-facade для legacy-клиентов и тестов-parity)
# --------------------------------------------------------------------------- #
def calculate_remaining_seconds(target_timestamp_ms: int, current_timestamp_ms: int) -> int:
    """Вычисляет оставшееся количество секунд до сброса/завершения."""
    diff_ms = target_timestamp_ms - current_timestamp_ms
    return max(0, diff_ms // 1000)


def format_remaining_time(remaining_seconds: int) -> str:
    """Форматирует секунды в читаемую строку ЧЧ:ММ:СС."""
    if remaining_seconds <= 0:
        return "00:00:00"
    hours = remaining_seconds // 3600
    minutes = (remaining_seconds % 3600) // 60
    seconds = remaining_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def get_timer_urgency(remaining_seconds: int) -> UrgencyLevel:
    """expired: 0 c; critical: < 4 ч; warning: < 12 ч; normal: более 12 ч."""
    if remaining_seconds <= 0:
        return "expired"
    if remaining_seconds < CRITICAL_THRESHOLD_S:
        return "critical"
    if remaining_seconds < WARNING_THRESHOLD_S:
        return "warning"
    return "normal"


# --------------------------------------------------------------------------- #
# Хелперы для v2-модели (timezone-aware datetime)
# --------------------------------------------------------------------------- #
def remaining_seconds(timer: _TimerLike, now: datetime) -> int:
    """0 для завершённых и истекших; иначе секунды до ends_at."""
    if timer.completed_at is not None:
        return 0
    return max(0, int((timer.ends_at - now).total_seconds()))


def is_expired(timer: _TimerLike, now: datetime) -> bool:
    return timer.completed_at is None and timer.ends_at <= now


def urgency(timer: _TimerLike, now: datetime) -> UrgencyLevel:
    return get_timer_urgency(remaining_seconds(timer, now))


def progress(timer: _TimerLike, now: datetime) -> float:
    """Доля прошедшего времени [0.0 .. 1.0] от starts_at до ends_at."""
    total = (timer.ends_at - timer.starts_at).total_seconds()
    if total <= 0:
        return 1.0
    elapsed = (now - timer.starts_at).total_seconds()
    return round(min(1.0, max(0.0, elapsed / total)), 4)


def to_timestamp_ms(value: datetime) -> int:
    """datetime -> миллисекундный epoch (поле target_timestamp старого API)."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return int(value.timestamp() * 1000)


def from_timestamp_ms(value: int) -> datetime:
    return datetime.fromtimestamp(value / 1000, tz=UTC)
