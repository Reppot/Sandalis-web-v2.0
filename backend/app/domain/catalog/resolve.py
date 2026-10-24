"""Сопоставление свободного названия предмета (сканер, Discord, XLSX) с кодом каталога.

Правила resolveItem() старого сайта (src/lib/itemCodes.ts):
  1) точное совпадение ключа по коду, русскому/английскому названию и алиасам;
  2) мягкое: ключ ≥ 4 символов, один содержит другой («120-мм» ↔ «120мм снаряды»),
     но только по границам слов: «Titan» не находится внутри «An[ti-Tan]k Grenade».
     Из нескольких совпадений берётся самое длинное (самое точное) название.
Ключ — нижний регистр, ё→е, только буквы/цифры, без хвоста «(Ящик)».
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Protocol

SERVICE_SUFFIX = re.compile(r"\s*\((?:ящик|ящ|штука|шт|crate|crates?)\)\s*$", re.I)
NON_WORD = re.compile(r"[^a-z0-9а-я]+")


def lookup_key(value: str | None) -> str:
    stripped = SERVICE_SUFFIX.sub("", value or "")
    return NON_WORD.sub("", stripped.lower().replace("ё", "е"))


def word_bounds(value: str | None) -> tuple[str, frozenset[int]]:
    """Ключ и позиции границ слов в нём («Anti-Tank» → "antitank", {0, 4, 8})."""
    stripped = SERVICE_SUFFIX.sub("", value or "").lower().replace("ё", "е")
    key, bounds = "", {0}
    for word in NON_WORD.split(stripped):
        if word:
            key += word
            bounds.add(len(key))
    return key, frozenset(bounds)


def _contains(outer: tuple[str, frozenset[int]], inner: str) -> bool:
    """inner входит в outer целыми словами (начало и конец — на границах слов)."""
    key, bounds = outer
    start = key.find(inner)
    while start != -1:
        if start in bounds and start + len(inner) in bounds:
            return True
        start = key.find(inner, start + 1)
    return False


class NamedItem(Protocol):
    code: str
    name: str
    english_name: str
    aliases: list[str]


@dataclass
class CatalogIndex:
    exact: dict[str, str]          # lookup_key -> code
    words: dict[str, frozenset[int]] = field(default_factory=dict)   # lookup_key -> границы слов

    @classmethod
    def build(cls, items: Iterable[NamedItem]) -> CatalogIndex:
        exact: dict[str, str] = {}
        words: dict[str, frozenset[int]] = {}
        for item in items:
            for value in (item.code, item.name, item.english_name, *(item.aliases or [])):
                key, bounds = word_bounds(value)
                if key:
                    exact.setdefault(key, item.code)
                    words[key] = words.get(key, frozenset()) | bounds
        return cls(exact=exact, words=words)

    def resolve(self, raw_name: str) -> str | None:
        key = lookup_key(raw_name)
        if not key:
            return None
        if key in self.exact:
            return self.exact[key]
        if len(key) < 4:
            return None
        query = word_bounds(raw_name)
        best: tuple[int, str] | None = None
        for candidate, code in self.exact.items():
            if len(candidate) < 4:
                continue
            outer = (candidate, self.words.get(candidate, frozenset({0, len(candidate)})))
            if _contains(query, candidate) or _contains(outer, key):
                if best is None or len(candidate) > best[0]:
                    best = (len(candidate), code)
        return best[1] if best else None
