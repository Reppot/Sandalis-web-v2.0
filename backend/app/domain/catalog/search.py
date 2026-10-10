"""Поиск по каталогу.

`search_catalog` — чистая функция, перенесённая из старого backend
(git history, commit d3d724b): регистронезависимый поиск по коду
(точное совпадение в приоритете), русскому и английскому наименованиям.

`build_conditions` / `build_order` — её DB-версия для SQLAlchemy 2.0:
те же правила, но без выборки всей таблицы в память.
"""
from __future__ import annotations

from typing import Any, Literal, Sequence

from sqlalchemy import ColumnElement, desc, or_

from app.domain.catalog.types import DomainItem


def escape_like(value: str) -> str:
    """Экранирование спецсимволов LIKE для пользовательского ввода."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search_catalog(
    items: list[DomainItem],
    query: str = "",
    category: str | Literal["all"] = "all",
) -> list[DomainItem]:
    """Чистая функция фильтрации и поиска предметов (1:1 со старым backend)."""
    clean_query = query.strip().lower()

    filtered: list[DomainItem] = []
    exact_code_matches: list[DomainItem] = []
    substring_matches: list[DomainItem] = []

    for item in items:
        if category != "all" and item.category != category:
            continue

        if not clean_query:
            filtered.append(item)
            continue

        item_code = item.code.lower()
        item_name = item.name.lower()
        item_en = item.english_name.lower()

        if item_code == clean_query:
            exact_code_matches.append(item)
        elif (
            clean_query in item_code
            or clean_query in item_name
            or clean_query in item_en
        ):
            substring_matches.append(item)

    if clean_query:
        return exact_code_matches + substring_matches

    return filtered


def build_conditions(
    model: type[Any],
    *,
    query: str = "",
    category: str | None = None,
    active_only: bool = False,
) -> list[ColumnElement[bool]]:
    """WHERE-клаузы повторяют чистую функцию: category + substring по code/name/english_name."""
    conditions: list[ColumnElement[bool]] = []
    if active_only:
        conditions.append(model.is_active.is_(True))
    if category and category != "all":
        conditions.append(model.category == category)

    clean_query = query.strip().lower()
    if clean_query:
        pattern = f"%{escape_like(clean_query)}%"
        conditions.append(
            or_(
                model.code.ilike(pattern, escape="\\"),
                model.name.ilike(pattern, escape="\\"),
                model.english_name.ilike(pattern, escape="\\"),
            )
        )
    return conditions


def build_order(model: type[Any], query: str = "") -> Sequence[ColumnElement[Any]]:
    """Точное совпадение кода — первым, дальше по коду. Без запроса — просто по коду."""
    clean_query = query.strip().lower()
    if not clean_query:
        return (model.code,)
    return (desc(model.code == clean_query), model.code)
