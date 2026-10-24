"""Разбор отчётов сканера склада / сообщений Discord в строки «название → количество».

Перенос 1:1 из старого сайта (Reppot/Sandalis-Web, src/lib/parsers.ts), чтобы веб и
десктоп-клиент разбирали одни и те же форматы одной реализацией на сервере:
  * «Название предмета, 50»        — классический формат сканера;
  * «Название предмета -> 50 шт.»  — формат экспорта терминала;
  * «Название предмета: 12 ящ»     — формат сообщений Discord;
  * «Название предмета 7»          — свободная строка;
  * JSON: массив {name, count, unit} или словарь {"Название": 50}.
Первая строка clipboard-отчёта Foxhole («Гекс - Склад - ... - X: .. Y: ..») пропускается.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Literal

Unit = Literal["crate", "unit"]

HEADER_HINTS = re.compile(r"public|private|x:\s*[-\d.]+|y:\s*[-\d.]+|valley|port|king", re.I)
REPORT_HEADER = re.compile(
    r"^(?:Clanshead|.+?\s-\s.+?\s-\s.+?\s-\s(?:Public|Private)).*X:\s*[-\d.]+\s+Y:\s*[-\d.]+.*,",
    re.I,
)
CRATE_SUFFIX = re.compile(r"\s*\((?:ящик|ящ|штука|шт|crate|crates?)\)\s*$", re.I)
UNIT_SUFFIX = re.compile(r"\s+(?:ящиков|ящика|ящик|ящ|штук|штука|шт)\.?\s*$", re.I)
COUNT_WORDS = re.compile(r"ящиков|ящика|ящик|ящ\.?|шт\.?|крат|crates?|crate|штук|шт")
FREE_LINE = re.compile(r"^(.*?\S)\s+[x×]?\s*(\d+)\s*(шт\.?|ящ\.?|ящиков|crates?)?\.?$", re.I)
COLON_COUNT = re.compile(r":\s*[x×]?\s*\d+")


@dataclass(frozen=True)
class ParsedLine:
    name: str
    count: int
    unit: Unit


def clean_name(raw: str) -> str:
    value = re.sub(r"[•*]", "", raw)
    value = re.sub(r"^[-–—]\s+", "", value)
    value = CRATE_SUFFIX.sub("", value)
    value = UNIT_SUFFIX.sub("", value)
    return re.sub(r"\s{2,}", " ", value).strip()


def parse_count(raw: str) -> int | None:
    cleaned = COUNT_WORDS.sub(" ", raw.lower())
    cleaned = re.sub(r"[x×]", " ", cleaned).strip()
    match = re.search(r"-?\d+", cleaned)
    return int(match.group(0)) if match else None


def detect_unit(raw: str, raw_name: str = "") -> Unit:
    if CRATE_SUFFIX.search(raw_name) or re.search(r"ящ", raw, re.I):
        return "crate"
    if re.search(r"шт", raw, re.I):
        return "unit"
    # В отчёте сканера Foxhole строки без «(Ящик)» — штучные; без имени — ящики (как в старом сайте).
    return "unit" if raw_name else "crate"


def parse_inventory_text(text: str) -> list[ParsedLine]:
    out: list[ParsedLine] = []
    for idx, raw_line in enumerate(text.splitlines()):
        line = raw_line.strip()
        if not line or REPORT_HEADER.search(line):
            continue

        if "->" in line:
            cut = line.rfind("->")
            name_part, count_part = line[:cut], line[cut + 2:]
        elif "," in line:
            cut = line.rfind(",")
            name_part, count_part = line[:cut], line[cut + 1:]
        elif COLON_COUNT.search(line):
            cut = line.rfind(":")
            name_part, count_part = line[:cut], line[cut + 1:]
        else:
            match = FREE_LINE.match(line)
            if not match:
                continue
            name_part, count_part = match.group(1), f"{match.group(2)} {match.group(3) or ''}"

        count = parse_count(count_part)
        name = clean_name(name_part)
        if idx == 0 and HEADER_HINTS.search(line):
            continue
        if not name or count is None or count < 0:
            continue
        out.append(ParsedLine(name=name, count=count, unit=detect_unit(count_part, name_part)))
    return out


def _pick(record: dict[str, Any], keys: list[str]) -> Any:
    lowered = {k.lower(): k for k in record}
    for key in keys:
        found = lowered.get(key.lower())
        if found is not None:
            return record[found]
    return None


# Ключи записей JSON: свои выгрузки, сканер склада, FIR / stockpiler (CodeName, Quantity, Crated?)
NAME_KEYS = ["name", "item", "title", "название", "nameRu", "nameEn", "code", "codeName", "itemCode",
             "item_code", "itemName", "displayName"]
COUNT_KEYS = ["count", "quantity", "qty", "amount", "количество", "crates", "total"]


def _from_json(value: Any) -> list[ParsedLine] | None:
    if isinstance(value, list):
        out: list[ParsedLine] = []
        for entry in value:
            if isinstance(entry, dict):
                name = _pick(entry, NAME_KEYS)
                count = _pick(entry, COUNT_KEYS)
                unit = _pick(entry, ["unit", "ед", "ед. изм."])
                crated = _pick(entry, ["crated?", "crated", "isCrated", "в ящиках"])
                n = count if isinstance(count, int) else parse_count(str(count or ""))
                if isinstance(name, str) and n is not None and n > 0:
                    if isinstance(unit, str):
                        kind = detect_unit(unit)
                    elif crated is not None:
                        kind = "crate" if str(crated).strip().lower() in ("true", "1", "yes", "да") else "unit"
                    else:
                        kind = "crate"
                    out.append(ParsedLine(name=clean_name(name), count=n, unit=kind))
            elif isinstance(entry, str):
                out.extend(parse_inventory_text(entry))
        return out
    if isinstance(value, dict):
        nested = _pick(value, ["items", "data", "stockpile", "inventory", "contents"])
        if nested is not None:
            return _from_json(nested)
        out = []
        for key, raw in value.items():
            n = raw if isinstance(raw, int) else parse_count(str(raw or ""))
            if n is not None and n > 0:
                out.append(ParsedLine(name=clean_name(key), count=n, unit="crate"))
        return out
    return None


def parse_inventory_payload(text: str) -> list[ParsedLine]:
    """Универсальный вход: JSON (массив/словарь) либо текстовые строки."""
    trimmed = text.strip()
    if trimmed.startswith(("{", "[")):
        try:
            parsed = _from_json(json.loads(trimmed))
        except json.JSONDecodeError:
            parsed = None
        # корректный JSON без распознанных строк — пусто, а не построчный разбор скобок
        if parsed is not None:
            return parsed
    return parse_inventory_text(trimmed)
