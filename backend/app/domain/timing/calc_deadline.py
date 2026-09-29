from datetime import datetime, timedelta, timezone

MINUTES_PER_BATCH = 26
BATCH_SIZE = 100


def calc_deadline(item_id: int, quantity: int, queue: int = 0) -> datetime:
    # момент готовности заказа с учётом очереди цеха
    batches = -(-quantity // BATCH_SIZE)  # ceil без math
    minutes = (batches + queue) * MINUTES_PER_BATCH
    return datetime.now(timezone.utc) + timedelta(minutes=minutes)
