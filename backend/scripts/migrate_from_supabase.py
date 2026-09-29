# Одноразовый перенос: запускается вручную, результат сверяется,
# затем Supabase выключается.
#   python -m scripts.migrate_from_supabase
import asyncio

TABLES = ["users", "sessions", "orders", "stockpiles", "timers", "codes", "items"]


async def main() -> None:
    # pg_dump --data-only через пулер  ->  psql в новую базу;
    # скрипт сверяет счётчики строк по каждой таблице
    for table in TABLES:
        ...  # select count(*) с одной и другой стороны
