"use client";

import * as React from "react";
import { Icon, LOCALES, cn, useI18n, useNotify, type Locale } from "@/shared";
import { authApi } from "@/features/cabinet/api/authApi";

/**
 * Переключатель языка интерфейса. Выбор сразу применяется и запоминается в браузере;
 * с persist — ещё и в профиле на сервере (тот же язык получит десктоп-клиент).
 */
export const LanguageSwitch: React.FC<{ persist?: boolean; className?: string; compact?: boolean }> = ({ persist, className, compact }) => {
  const { locale, setLocale, t } = useI18n();
  const notify = useNotify();

  const pick = (code: Locale) => {
    if (code === locale) return;
    setLocale(code);
    if (persist) authApi.setLocale(code).catch(() => notify({ title: t("lang.title"), message: t("lang.saveFailed"), tone: "warning" }));
  };

  if (compact) {
    return (
      <div className={cn("lang-pills", className)} role="radiogroup" aria-label={t("lang.title")}>
        {LOCALES.map((l) => (
          <button key={l.code} type="button" role="radio" aria-checked={l.code === locale} lang={l.code} title={l.label} className={cn("lang-pill", l.code === locale && "is-active")} onClick={() => pick(l.code)}>
            {l.flag}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("lang-choices", className)} role="radiogroup" aria-label={t("lang.title")}>
      {LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          role="radio"
          aria-checked={l.code === locale}
          lang={l.code}
          className={cn("lang-choice", l.code === locale && "is-active")}
          onClick={() => pick(l.code)}
        >
          <span className="lang-choice-code">{l.flag}</span>
          <span className="min-w-0 flex-1 text-left">{l.label}</span>
          {l.code === locale ? <Icon name="check" size={16} strokeWidth={2.5} /> : null}
        </button>
      ))}
    </div>
  );
};

/** Карточка «Язык интерфейса» в личном кабинете. */
export const LanguagePanel: React.FC<{ persist?: boolean }> = ({ persist }) => {
  const { t } = useI18n();
  return (
    <section data-guide="cab-lang" className="panel p-5">
      <div className="panel-title">{t("lang.title")}</div>
      <p className="mt-1 mb-5 text-sm text-fg-3">{t(persist ? "lang.hint" : "lang.hintLocal")}</p>
      <LanguageSwitch persist={persist} />
    </section>
  );
};
