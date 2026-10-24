"""Unit: парсер отчётов сканера, резолвер названий и сканер MapData.sav (без БД)."""
from __future__ import annotations

import struct
from dataclasses import dataclass, field

from app.domain.catalog.mapdata import parse_map_data
from app.domain.catalog.parsers import ParsedLine, parse_inventory_payload
from app.domain.catalog.resolve import CatalogIndex, lookup_key


class TestParsers:
    def test_scanner_report_skips_header_and_reads_units(self):
        text = (
            "Clanshead Valley - The King - Морской порт - Public - X: 0.49 Y: 0.38,2026.09.20-08.25.33\n"
            "Бинты (Ящик),12\n"
            "Basic Materials,300\n"
        )
        assert parse_inventory_payload(text) == [
            ParsedLine(name="Бинты", count=12, unit="crate"),
            ParsedLine(name="Basic Materials", count=300, unit="unit"),
        ]

    def test_arrow_colon_and_free_formats(self):
        text = "• Rifle -> 5 ящ.\nКровь: 7 шт\nSoldier Supplies 40"
        assert parse_inventory_payload(text) == [
            ParsedLine(name="Rifle", count=5, unit="crate"),
            ParsedLine(name="Кровь", count=7, unit="unit"),
            ParsedLine(name="Soldier Supplies", count=40, unit="unit"),
        ]

    def test_json_array_and_dict(self):
        assert parse_inventory_payload('[{"name": "Rifle", "count": 3, "unit": "шт"}]') == [
            ParsedLine(name="Rifle", count=3, unit="unit"),
        ]
        assert parse_inventory_payload('{"items": {"Бинты": 4}}') == [
            ParsedLine(name="Бинты", count=4, unit="crate"),
        ]

    def test_stockpiler_json_keys(self):
        payload = '{"items": [{"CodeName": "Bandages", "Quantity": 12, "Crated?": true},' \
                  ' {"CodeName": "RifleAmmo", "Quantity": 40, "Crated?": false}]}'
        assert parse_inventory_payload(payload) == [
            ParsedLine(name="Bandages", count=12, unit="crate"),
            ParsedLine(name="RifleAmmo", count=40, unit="unit"),
        ]

    def test_unknown_json_shape_is_empty_not_garbage(self):
        assert parse_inventory_payload('[{"foo": "bar", "baz": 3}]') == []

    def test_garbage_is_ignored(self):
        assert parse_inventory_payload("просто текст без чисел\n\n") == []


@dataclass
class Item:
    code: str
    name: str
    english_name: str
    aliases: list[str] = field(default_factory=list)


class TestResolve:
    index = CatalogIndex.build([
        Item("LightArtilleryAmmo", "120мм снаряды", "120mm", ["120-мм"]),
        Item("Bandages", "Бинты", "Bandages"),
        Item("RifleW", "Винтовка", "Rifle"),
        Item("ATLaunchedGrenadeW", "Гранатомёт", "B2 Varsi Anti-Tank Grenade"),
        Item("FortWeatherStationPart", "Детали метеостанции", "Weather Station Parts"),
    ])

    def test_lookup_key_normalizes(self):
        assert lookup_key("Ёлка (Ящик)") == "елка"

    def test_exact_by_code_name_alias(self):
        assert self.index.resolve("Bandages") == "Bandages"
        assert self.index.resolve("бинты (ящик)") == "Bandages"
        assert self.index.resolve("120-мм") == "LightArtilleryAmmo"

    def test_fuzzy_and_unknown(self):
        assert self.index.resolve("120мм снаряды HE") == "LightArtilleryAmmo"
        assert self.index.resolve("Кот") is None

    def test_fuzzy_respects_word_boundaries(self):
        # «Titan» (линкор) не должен находиться внутри «An[ti-Tan]k Grenade»
        assert self.index.resolve("Titan") is None
        assert self.index.resolve("Weather Station") == "FortWeatherStationPart"


class TestMapData:
    @staticmethod
    def _entry(code: str, value: int, terminated: bool = True) -> bytes:
        name = code.encode() + (b"\x00" if terminated else b"")
        return name + b"..." + b"Int16Property" + b"\x00" * 9 + struct.pack("<h", value) + b"\x00" * 20

    def test_strict_pass(self):
        buf = b"junk" + self._entry("Bandages", 12) + self._entry("RifleW", 3)
        result = parse_map_data(buf, ["Bandages", "RifleW", "Missing"])
        assert result.strict is True
        assert result.counts == {"Bandages": 12, "RifleW": 3}

    def test_soft_pass_when_strict_finds_nothing(self):
        buf = self._entry("Bandages", 5, terminated=False)
        result = parse_map_data(buf, ["Bandages"])
        assert result.strict is False
        assert result.counts == {"Bandages": 5}
