from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.config import settings
from app.core.i18n.catalog import lookup


def _plural_category(locale: str, n: int) -> str:
    """Упрощённые CLDR-правила для ru/cs/en."""
    if locale in ("ru",):
        mod10, mod100 = n % 10, n % 100
        if mod10 == 1 and mod100 != 11:
            return "one"
        if 2 <= mod10 <= 4 and not 12 <= mod100 <= 14:
            return "few"
        return "many"
    if locale == "cs":
        if n == 1:
            return "one"
        if 2 <= n <= 4:
            return "few"
        return "other"
    return "one" if n == 1 else "other"


@dataclass(frozen=True, slots=True)
class Translator:
    """
    Иммутабельный переводчик на один HTTP-запрос.

        t("order.not_found", domain="production", order_id=42)
        t("production:order.not_found", order_id=42)     # короткая форма
        t("production:order.queued", count=3)            # плюрализация
    """

    locale: str
    default_domain: str = "core"

    def resolve(self, key: str, domain: str | None = None) -> tuple[str, str]:
        if ":" in key:
            dom, _, plain = key.partition(":")
            return dom, plain
        return domain or self.default_domain, key

    def t(self, key: str, /, *, domain: str | None = None,
          count: int | None = None, **params: Any) -> str:
        dom, plain = self.resolve(key, domain)
        candidates: list[str] = []
        if count is not None:
            candidates.append(f"{plain}.{_plural_category(self.locale, count)}")
            candidates.append(f"{plain}.other")
        candidates.append(plain)

        for locale in (self.locale, settings.DEFAULT_LOCALE):
            for candidate in candidates:
                # сначала собственный домен, затем общий core
                for search_domain in (dom, "core"):
                    template = lookup(search_domain, locale, candidate)
                    if template is not None:
                        return self._format(template, count=count, **params)
        return key  # ключ как fallback — заметно в тестах, не падает в проде

    @staticmethod
    def _format(template: str, *, count: int | None = None, **params: Any) -> str:
        values = dict(params)
        if count is not None:
            values.setdefault("count", count)
        try:
            return template.format(**values)
        except (KeyError, IndexError, ValueError):
            return template

    __call__ = t


def for_domain(translator: Translator, domain: str) -> Translator:
    return Translator(locale=translator.locale, default_domain=domain)
