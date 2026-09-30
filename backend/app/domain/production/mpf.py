from dataclasses import dataclass

# Ступени скидок фабрики массового производства (MPF) Foxhole:
# 1-й заказ: 10%, 2-й: 20%, 3-й: 30%, 4-й: 40%, 5-9-й: 50%
MPF_DISCOUNT_TIERS: tuple[float, ...] = (0.10, 0.20, 0.30, 0.40, 0.50, 0.50, 0.50, 0.50, 0.50)


@dataclass(frozen=True)
class MpfCalculationResult:
    total_crates: int
    total_cost: int
    standard_cost: int
    savings: int
    savings_percentage: int
    cost_per_crate: int
    tier_costs: list[int]


def calculate_mpf_queue(
    base_cost: int,
    queue_count: int,
    crate_multiplier: int = 1,
) -> MpfCalculationResult:
    """Чистый расчет стоимости очереди MPF со всеми скидками Foxhole.

    :param base_cost: Базовая цена 1 ящика на обычной фабрике
    :param queue_count: Количество очередей (от 1 до 9)
    :param crate_multiplier: Множитель ящиков в слоте (1, 3 или 5)
    """
    if base_cost < 0:
        raise ValueError("base_cost cannot be negative")
    if crate_multiplier < 1:
        raise ValueError("crate_multiplier must be >= 1")

    # В MPF максимум 9 слотов
    slots = min(max(1, queue_count), 9)

    tier_costs: list[int] = []
    total_cost = 0

    for i in range(slots):
        discount = MPF_DISCOUNT_TIERS[i]
        cost_for_tier = round(base_cost * (1.0 - discount) * crate_multiplier)
        tier_costs.append(cost_for_tier)
        total_cost += cost_for_tier

    total_crates = slots * crate_multiplier
    standard_cost = base_cost * total_crates
    savings = standard_cost - total_cost
    savings_percentage = round((savings / standard_cost) * 100) if standard_cost > 0 else 0
    cost_per_crate = round(total_cost / total_crates) if total_crates > 0 else 0

    return MpfCalculationResult(
        total_crates=total_crates,
        total_cost=total_cost,
        standard_cost=standard_cost,
        savings=savings,
        savings_percentage=savings_percentage,
        cost_per_crate=cost_per_crate,
        tier_costs=tier_costs,
    )