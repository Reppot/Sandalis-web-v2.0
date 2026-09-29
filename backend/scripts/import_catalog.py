import json
from pathlib import Path

import h5py


def load_items(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["items"]


def main() -> None:
    items = load_items(Path("data/catalog.json"))

    with h5py.File("data/fs_vanilla.h5", "r") as h5:
        # вытягиваем датасеты карт и складываем рядом с items
        ...

    # дальше — bulk insert в items/recipes через AsyncSession
