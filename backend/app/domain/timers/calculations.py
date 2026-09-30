from typing import Literal

UrgencyLevel = Literal["normal", "warning", "critical", "expired"]


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
    """Определяет уровень критичности таймера:

    - expired: время вышло (0 сек)
    - critical: осталось менее 4 часов (< 14 400 сек)
    - warning: осталось менее 12 часов (< 43 200 сек)
    - normal: более 12 часов
    """
    if remaining_seconds <= 0:
        return "expired"
    if remaining_seconds < 4 * 3600:
        return "critical"
    if remaining_seconds < 12 * 3600:
        return "warning"
    return "normal"