"use client";

import * as React from "react";
import { LOCALES, cn, useI18n, useNotify, type Locale } from "@/shared";
import { authApi } from "@/features/cabinet/api/authApi";

/**
 * Переключатель языка интерфейса. Выбор сразу применяется и запоминается в браузере;
 * с persist — ещё и в профиле на сервере (тот же язык получит десктоп-клиент).
 */
export const LanguageSwitch: React.FC<{ persist?: boolean; className?: string }> = ({ persist, className }) => {
  const { locale, setLocale, t } = useI18n();
  const notify = useNotify();

  const pick = (code: Locale) => {
    if (code === locale) return;
    setLocale(code);
    if (persist) authApi.setLocale(code).catch(() => notify({ title: t("lang.title"), message: t("lang.saveFailed"), tone: "warning" }));
  };

  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="radiogroup" aria-label={t("lang.title")}>
      {LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          role="radio"
          aria-checked={l.code === locale}
          lang={l.code}
          className={cn("btn min-w-[7.5rem] justify-start gap-2", l.code === locale && "btn-active")}
          onClick={() => pick(l.code)}
        >
          <span className="font-mono text-accent">{l.flag}</span>
          <span>{l.label}</span>
        </button>
      ))}
    </div>
  );
};

/** Карточка «Язык интерфейса» в личном кабинете. */
export const LanguagePanel: React.FC<{ persist?: boolean }> = ({ persist }) => {
  const { t } = useI18n();
  return (
    <section className="panel panel-corners rounded-md p-4">
      <div className="panel-title">🌐 {t("lang.title")}</div>
      <div className="cabinet-rule" />
      <p className="mb-3 text-[0.78rem] text-white/70">{t(persist ? "lang.hint" : "lang.hintLocal")}</p>
      <LanguageSwitch persist={persist} />
    </section>
  );
};
