from app.schemas.stockpile import GameScanStockpile


def test_game_scan_accepts_contract_names_and_legacy_desktop_names():
    common = {
        "name": "Port Kirknell",
        "hex": "DeadlandsHex",
        "town": "Kirknell",
        "coords": {"x": 0.2, "y": 0.7},
        "items": [{"code": "rifle", "quantity": 12, "crated": True}],
    }

    contract = GameScanStockpile.model_validate({**common, "kind": "Seaport"})
    legacy = GameScanStockpile.model_validate({
        **{key: value for key, value in common.items() if key != "items"},
        "type": "Seaport",
        "items": [{"item_code": "rifle", "quantity": 12, "crated": True}],
    })

    assert contract.kind == legacy.kind == "Seaport"
    assert contract.items[0].item_code == legacy.items[0].item_code == "rifle"
    assert contract.name == legacy.name == "Port Kirknell"
