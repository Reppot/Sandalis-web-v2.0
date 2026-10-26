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
        assert parse_accept_language("ja-JP,ko;q=0.5") == "en"

    def test_new_locales_negotiated(self):
        assert parse_accept_language("fr-FR,de;q=0.5") == "fr"
        assert parse_accept_language("pt-BR") == "pt"
        assert parse_accept_language("zh-CN,zh;q=0.9") == "zh"
        assert parse_accept_language("uk-UA") == "uk"
        assert parse_accept_language("sk-SK") == "cs"

    def test_empty_and_star(self):
        assert parse_accept_language(None) == "en"
        assert parse_accept_language("ja, *;q=0.1") == "en"

    def test_q_zero_skipped(self):
        assert parse_accept_language("cs;q=0, ru;q=0.4") == "ru"

    def test_normalize(self):
        assert normalize_locale("CZ") == "cs"
        assert normalize_locale("en_GB") == "en"
        assert normalize_locale("uk") == "uk"
        assert normalize_locale("ua") == "uk"
        assert normalize_locale("ja") is None
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

    def test_uk_pl_plural_forms(self):
        uk = Translator(locale="uk")
        assert uk("production:order.queued", count=1) == "У чергу додано 1 позицію."
        assert uk("production:order.queued", count=3) == "У чергу додано 3 позиції."
        assert uk("production:order.queued", count=11) == "У чергу додано 11 позицій."
        pl = Translator(locale="pl")
        assert pl("production:order.queued", count=1) == "Dodano do kolejki 1 pozycję."
        assert pl("production:order.queued", count=22) == "Dodano do kolejki 22 pozycje."
        assert pl("production:order.queued", count=25) == "Dodano do kolejki 25 pozycji."

    def test_fr_zh_plural_forms(self):
        assert Translator(locale="fr")("production:order.queued", count=0) == "0 ligne ajoutée à la file."
        assert Translator(locale="fr")("production:order.queued", count=2) == "2 lignes ajoutées à la file."
        assert Translator(locale="zh")("production:order.queued", count=5) == "已加入队列 5 项。"

    def test_every_locale_has_every_key(self):
        from app.core.config import settings
        from app.core.i18n.catalog import _REGISTRY
        for domain, by_locale in _REGISTRY.items():
            strip = lambda k: k.rsplit(".", 1)[0] if k.rsplit(".", 1)[-1] in {"one", "few", "many", "other"} else k
            ref = {strip(k) for k in by_locale["en"]}
            for loc in settings.SUPPORTED_LOCALES:
                assert {strip(k) for k in by_locale[loc]} == ref, (domain, loc)

    def test_params_interpolation(self):
        t = Translator(locale="ru")
        assert t("production:order.not_enough_stock",
                 item="rifle", needed=10, available=4) == \
            "На складе не хватает «rifle»: нужно 10, доступно 4."

    def test_fallback_to_default_locale(self):
        t = Translator(locale="ja")  # локаль не поддерживается -> DEFAULT_LOCALE
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
