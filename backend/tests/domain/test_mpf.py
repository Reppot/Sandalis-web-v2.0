import pytest
from app.domain.production.mpf import calculate_mpf_queue


def test_mpf_calculation_single_queue():
    # 1 заказ со скидкой 10%
    res = calculate_mpf_queue(base_cost=100, queue_count=1, crate_multiplier=1)
    assert res.total_crates == 1
    assert res.total_cost == 90
    assert res.savings == 10
    assert res.savings_percentage == 10


def test_mpf_calculation_max_queue():
    # 9 заказов: 10, 20, 30, 40, 50, 50, 50, 50, 50%
    res = calculate_mpf_queue(base_cost=100, queue_count=9, crate_multiplier=1)
    assert res.total_crates == 9
    assert res.tier_costs == [90, 80, 70, 60, 50, 50, 50, 50, 50]
    assert res.total_cost == 500
    assert res.standard_cost == 900
    assert res.savings == 400
    assert res.savings_percentage == 44


def test_mpf_validation_errors():
    with pytest.raises(ValueError):
        calculate_mpf_queue(base_cost=-10, queue_count=1)

    with pytest.raises(ValueError):
        calculate_mpf_queue(base_cost=100, queue_count=1, crate_multiplier=0)