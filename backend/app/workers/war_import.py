import json
from dataclasses import dataclass
from typing import Mapping


class WarImportError(ValueError):
    pass


@dataclass(frozen=True)
class WarRegionSnapshot:
    region: str
    control: str
    victory_points: int


def parse_war_payload(
    payload: str | bytes,
) -> tuple[WarRegionSnapshot, ...]:
    try:
        decoded = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise WarImportError(
            "War payload is not valid JSON",
        ) from exc

    if not isinstance(decoded, dict):
        raise WarImportError(
            "War payload must be an object",
        )

    raw_regions = decoded.get("regions")

    if not isinstance(raw_regions, list):
        raise WarImportError(
            "War payload must contain a regions array",
        )

    snapshots: list[WarRegionSnapshot] = []

    for raw_region in raw_regions:
        if not isinstance(raw_region, Mapping):
            raise WarImportError(
                "Every region must be an object",
            )

        region = raw_region.get("region")
        control = raw_region.get("control")
        victory_points = raw_region.get("victoryPoints")

        if not isinstance(region, str) or not region:
            raise WarImportError(
                "Region name is required",
            )

        if not isinstance(control, str) or not control:
            raise WarImportError(
                "Region control is required",
            )

        if not isinstance(victory_points, int):
            raise WarImportError(
                "Region victoryPoints must be an integer",
            )

        snapshots.append(
            WarRegionSnapshot(
                region=region,
                control=control,
                victory_points=victory_points,
            )
        )

    return tuple(snapshots)