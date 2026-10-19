"""Сопоставление свободного названия предмета (сканер, Discord, XLSX) с кодом каталога.

Правила resolveItem() старого сайта (src/lib/itemCodes.ts):
  1) точное совпадение ключа по коду, русскому/английскому названию и алиасам;
  2) мягкое: ключ ≥ 4 символов, один содержит другой («120-мм» ↔ «120мм снаряды»).
Ключ — нижний регистр, ё→е, только буквы/цифры, без хвоста «(Ящик)».
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Protocol

SERVICE_SUFFIX = re.compile(r"\s*\((?:ящик|ящ|штука|шт|crate|crates?)\)\s*$", re.I)
NON_WORD = re.compile(r"[^a-z0-9а-я]+")


def lookup_key(value: str | None) -> str:
    stripped = SERVICE_SUFFIX.sub("", value or "")
    return NON_WORD.sub("", stripped.lower().replace("ё", "е"))


class NamedItem(Protocol):
    code: str
    name: str
    english_name: str
    aliases: list[str]


@dataclass
class CatalogIndex:
    exact: dict[str, str]          # lookup_key -> code

    @classmethod
    def build(cls, items: Iterable[NamedItem]) -> CatalogIndex:
        exact: dict[str, str] = {}
        for item in items:
            for value in (item.code, item.name, item.english_name, *(item.aliases or [])):
                key = lookup_key(value)
                if key:
                    exact.setdefault(key, item.code)
        return cls(exact=exact)

    def resolve(self, raw_name: str) -> str | None:
        key = lookup_key(raw_name)
        if not key:
            return None
        if key in self.exact:
            return self.exact[key]
        if len(key) < 4:
            return None
        for candidate, code in self.exact.items():
            if len(candidate) >= 4 and (candidate in key or key in candidate):
                return code
        return None
