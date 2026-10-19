"""Побайтовый разбор MapData.sav (сохранение Unreal Engine) — перенос src/lib/mapdata.ts.

Для каждого кода каталога ищем вхождение имени, затем маркер «Int16Property» в
60 байтах после него; значение (Int16 LE) лежит через 9 байт после маркера.
Сначала строгий проход (код завершается NUL-байтом), при пустом результате — мягкий.
Чистая функция: коды приходят из БД, файл не пишется на диск (ФС Render эфемерна).
"""
from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import Iterable

MARKER = b"Int16Property"
LOOKAHEAD = 60
VALUE_OFFSET = 9
MAX_SANE = 32000


@dataclass(frozen=True)
class MapDataResult:
    counts: dict[str, int]       # code -> количество
    strict: bool


def _scan(buf: bytes, codes: Iterable[str], strict: bool) -> dict[str, int]:
    parsed: dict[str, int] = {}
    for code in codes:
        needle = code.encode("utf-8")
        pos = buf.find(needle)
        while pos != -1:
            end = pos + len(needle)
            boundary_ok = not strict or end >= len(buf) or buf[end] == 0
            if boundary_ok:
                block = buf[pos:min(pos + LOOKAHEAD, len(buf))]
                marker = block.find(MARKER)
                if marker != -1:
                    value_pos = pos + marker + len(MARKER) + VALUE_OFFSET
                    if value_pos + 2 <= len(buf):
                        (value,) = struct.unpack_from("<h", buf, value_pos)
                        if 0 < value < MAX_SANE:
                            parsed[code] = max(parsed.get(code, 0), value)
            pos = buf.find(needle, end)
    return parsed


def parse_map_data(buf: bytes, codes: Iterable[str]) -> MapDataResult:
    code_list = list(codes)
    counts = _scan(buf, code_list, strict=True)
    if counts:
        return MapDataResult(counts=counts, strict=True)
    return MapDataResult(counts=_scan(buf, code_list, strict=False), strict=False)
