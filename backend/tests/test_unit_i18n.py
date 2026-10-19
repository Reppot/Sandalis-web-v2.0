"""Юнит-тесты модульной интернационализации: negotiation, каталоги, плюрализация."""
from __future__ import annotations

from app.core.i18n import (
    Translator,
    known_domains,
    load_catalogs,
    normalize_locale,
    parse_accept_language,
)


class TestNegotiation:
    def test_plain_tag(self):
        assert parse_accept_language("ru-RU,ru;q=0.9,en;q=0.8") == "ru"

    def test_q_factor_wins(self):
        assert parse_accept_language("cs;q=0.5, en;q=0.9") == "en"

    def test_cz_alias_maps_to_cs(self):
        assert parse_accept_language("cz") == "cs"
        assert parse_accept_language("cs-CZ") == "cs"

    def test_unsupported_falls_back_to_default(self):
        assert parse_accept_language("fr-FR,de;q=0.5") == "en"

    def test_empty_and_star(self):
        assert parse_accept_language(None) == "en"
        assert parse_accept_language("fr, *;q=0.1") == "en"

    def test_q_zero_skipped(self):
        assert parse_accept_language("cs;q=0, ru;q=0.4") == "ru"

    def test_normalize(self):
        assert normalize_locale("CZ") == "cs"
        assert normalize_locale("en_GB") == "en"
        assert normalize_locale("uk") is None
        assert normalize_locale(None) is None


class TestCatalogAndTranslator:
    @classmethod
    def setup_class(cls):
        load_catalogs()

    def test_domains_discovered_from_filesystem(self):
        assert set(known_domains()) == {
            "core", "catalog", "production", "auth", "stockpiles", "timers", "reports",
        }

    def test_ru_plural_forms(self):
        t = Translator(locale="ru")
        assert t("order.queued", domain="production", count=1) == \
            "В очередь добавлена 1 позиция."
        assert t("order.queued", domain="production", count=3) == \
            "В очередь добавлено 3 позиции."
        assert t("order.queued", domain="production", count=7) == \
            "В очередь добавлено 7 позиций."

    def test_cs_plural_forms(self):
        t = Translator(locale="cs")
        assert t("order.queued", domain="production", count=2) == \
            "Do fronty byly přidány 2 položky."
        assert t("order.queued", domain="production", count=5) == \
            "Do fronty bylo přidáno 5 položek."

    def test_en_plural_other(self):
        t = Translator(locale="en")
        assert t("production:order.queued", count=5) == "5 items queued."

    def test_params_interpolation(self):
        t = Translator(locale="ru")
        assert t("production:order.not_enough_stock",
                 item="rifle", needed=10, available=4) == \
            "На складе не хватает «rifle»: нужно 10, доступно 4."

    def test_fallback_to_default_locale(self):
        t = Translator(locale="fr")  # локаль не поддерживается -> DEFAULT_LOCALE
        assert t("errors.unauthorized") == "Clan authentication required."

    def test_fallback_to_core_domain(self):
        # ключ есть только в core, домен по умолчанию — production
        t = Translator(locale="ru", default_domain="production")
        assert t("errors.internal") == "Внутренняя ошибка сервера. Попробуйте позже."

    def test_missing_key_returns_key(self):
        assert Translator(locale="ru").t("no.such.key") == "no.such.key"

    def test_missing_format_param_does_not_crash(self):
        t = Translator(locale="ru")
        out = t("order.not_found", domain="production")  # без order_id
        assert out.startswith("Заказ {order_id}")  # шаблон вернулся как есть
