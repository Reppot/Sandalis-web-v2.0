"""Геометрия расчётной линии фронта по ратушам обеих фракций."""

from app.services.war_map import _frontline_from_town_halls


def hall(team: str, x: float, y: float) -> dict[str, float | str]:
    return {"team": team, "x": x, "y": y}


def test_frontline_uses_unique_mutual_townhall_pairs_in_order():
    towns = [hall("wardens", 0, y) for y in (0, 1000, 2000, 3000)]
    towns += [hall("colonials", 2000, y) for y in (0, 1000, 2000, 3000)]
    # Эта ратуша далеко от линии, а ближайшая колониальная ратуша не выбирает её обратно.
    towns.append(hall("wardens", 7000, 1500))

    points = _frontline_from_town_halls(towns)

    assert len(points) == 4
    assert [point["y"] for point in points] == sorted(point["y"] for point in points)
    assert all(abs(point["x"] - 1000) < 1 for point in points)


def test_frontline_suppresses_isolated_pair_that_would_create_a_jump():
    towns = [hall("wardens", 0, y) for y in (0, 1000, 2000, 3000)]
    towns += [hall("colonials", 2000, y) for y in (0, 1000, 2000, 3000)]
    # Локальная пара далеко позади общей линии образует выброс в наборе середин.
    towns.extend((hall("wardens", 5000, 1500), hall("colonials", 5500, 1500)))

    points = _frontline_from_town_halls(towns)

    assert len(points) == 5
    assert max(point["x"] for point in points) - min(point["x"] for point in points) < 1000
    assert max(
        ((right["x"] - left["x"]) ** 2 + (right["y"] - left["y"]) ** 2) ** 0.5
        for left, right in zip(points, points[1:])
    ) < 1200
