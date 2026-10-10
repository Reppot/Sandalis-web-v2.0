from __future__ import annotations

from app.core.config import settings

# Фронт/браузеры шлют разное: cs-CZ, cs, cz, ru-RU, ru, en-GB...
_ALIASES = {"cz": "cs", "cze": "cs", "ces": "cs", "rus": "ru", "eng": "en", "ua": "ru"}


def normalize_locale(tag: str | None) -> str | None:
    if not tag:
        return None
    primary = tag.strip().lower().replace("_", "-").split("-", 1)[0]
    primary = _ALIASES.get(primary, primary)
    return primary if primary in settings.SUPPORTED_LOCALES else None


def parse_accept_language(header: str | None) -> str:
    """RFC 7231: разбор с учётом q-факторов. Возвращает поддерживаемую локаль."""
    if not header:
        return settings.DEFAULT_LOCALE

    ranked: list[tuple[float, int, str]] = []
    for order, part in enumerate(header.split(",")):
        chunk = part.strip()
        if not chunk:
            continue
        tag, _, params = chunk.partition(";")
        quality = 1.0
        for param in params.split(";"):
            key, _, value = param.partition("=")
            if key.strip() == "q":
                try:
                    quality = float(value)
                except ValueError:
                    quality = 0.0
        if quality > 0:
            ranked.append((-quality, order, tag.strip()))

    for _, _, tag in sorted(ranked):
        if tag == "*":
            return settings.DEFAULT_LOCALE
        if (loc := normalize_locale(tag)) is not None:
            return loc
    return settings.DEFAULT_LOCALE
