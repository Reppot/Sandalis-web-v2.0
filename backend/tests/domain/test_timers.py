from app.domain.timers.calculations import (
    calculate_remaining_seconds,
    format_remaining_time,
    get_timer_urgency,
)


def test_calculate_remaining_seconds():
    now_ms = 1_000_000_000
    target_ms = 1_000_010_000
    assert calculate_remaining_seconds(target_ms, now_ms) == 10

    # Прошедшее время
    past_ms = 999_990_000
    assert calculate_remaining_seconds(past_ms, now_ms) == 0


def test_format_remaining_time():
    assert format_remaining_time(0) == "00:00:00"
    assert format_remaining_time(65) == "00:01:05"
    assert format_remaining_time(3665) == "01:01:05"
    assert format_remaining_time(48 * 3600) == "48:00:00"


def test_get_timer_urgency():
    assert get_timer_urgency(0) == "expired"
    assert get_timer_urgency(3 * 3600) == "critical"   # < 4 часов
    assert get_timer_urgency(8 * 3600) == "warning"    # < 12 часов
    assert get_timer_urgency(24 * 3600) == "normal"    # > 12 часов