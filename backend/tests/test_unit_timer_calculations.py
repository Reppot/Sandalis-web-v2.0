"""Юнит-тесты доменных расчётов таймеров (parity со старым backend + v2-хелперы)."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.domain.timers import calculations as calc


class TestLegacyParity:
    def test_remaining_seconds_from_ms(self):
        assert calc.calculate_remaining_seconds(110_000, 100_000) == 10
        assert calc.calculate_remaining_seconds(90_000, 100_000) == 0

    def test_format(self):
        assert calc.format_remaining_time(0) == "00:00:00"
        assert calc.format_remaining_time(3661) == "01:01:01"
        assert calc.format_remaining_time(172_800) == "48:00:00"

    def test_urgency_thresholds(self):
        assert calc.get_timer_urgency(0) == "expired"
        assert calc.get_timer_urgency(4 * 3600 - 1) == "critical"
        assert calc.get_timer_urgency(4 * 3600) == "warning"
        assert calc.get_timer_urgency(12 * 3600 - 1) == "warning"
        assert calc.get_timer_urgency(12 * 3600) == "normal"

    def test_ms_roundtrip(self):
        now = datetime.now(UTC)
        # roundtrip сохраняет миллисекундную точность (микросекунды отсекаются)
        back = calc.from_timestamp_ms(calc.to_timestamp_ms(now))
        assert abs((now - back).total_seconds()) < 0.001


class TestV2DatetimeHelpers:
    def _timer(self, *, hours_left: float = 10, completed: bool = False) -> SimpleNamespace:
        now = datetime.now(UTC)
        return SimpleNamespace(
            starts_at=now - timedelta(hours=2),
            ends_at=now + timedelta(hours=hours_left),
            completed_at=now if completed else None,
        )

    def test_remaining_and_expired(self):
        now = datetime.now(UTC)
        t = self._timer(hours_left=1)
        assert 3_500 < calc.remaining_seconds(t, now) <= 3_600
        assert not calc.is_expired(t, now)

        over = self._timer(hours_left=-1)
        assert calc.remaining_seconds(over, now) == 0
        assert calc.is_expired(over, now)
        assert calc.urgency(over, now) == "expired"

    def test_completed_timer_is_not_expired(self):
        now = datetime.now(UTC)
        t = self._timer(hours_left=-1, completed=True)
        assert calc.remaining_seconds(t, now) == 0
        assert not calc.is_expired(t, now)

    def test_progress_clamped(self):
        now = datetime.now(UTC)
        before = SimpleNamespace(
            starts_at=now + timedelta(hours=1),
            ends_at=now + timedelta(hours=3),
            completed_at=None,
        )
        assert calc.progress(before, now) == 0.0

        after = self._timer(hours_left=-2)
        assert calc.progress(after, now) == 1.0

        mid = SimpleNamespace(
            starts_at=now - timedelta(hours=1),
            ends_at=now + timedelta(hours=1),
            completed_at=None,
        )
        assert calc.progress(mid, now) == 0.5
