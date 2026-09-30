from typing import Literal

from app.domain.catalog.types import DomainItem, ItemCategory


def search_catalog(
    items: list[DomainItem],
    query: str = "",
    category: ItemCategory | Literal["all"] = "all",
) -> list[DomainItem]:
    """Чистая функция фильтрации и поиска предметов.

    Поиск регистронезависимый по коду (точное совпадение в приоритете),
    русскому и английскому наименованиям.
    """
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