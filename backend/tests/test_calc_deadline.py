from datetime import datetime, timezone

from app.domain.timing import calc_deadline


def test_one_batch_is_twenty_six_minutes():
    eta = calc_deadline(item_id=1, quantity=100)
    delta = eta - datetime.now(timezone.utc)
    assert 25 * 60 <= delta.total_seconds() <= 27 * 60


def test_queue_adds_full_batches():
    plain = calc_deadline(1, 100, queue=0)
    queued = calc_deadline(1, 100, queue=2)
    assert (queued - plain).total_seconds() == 2 * 26 * 60
