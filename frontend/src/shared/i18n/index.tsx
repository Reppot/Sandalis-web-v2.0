"use client";

import * as React from "react";
import { setApiLocale } from "@/shared/api/client";
import { cs } from "@/shared/i18n/messages/cs";
import { en } from "@/shared/i18n/messages/en";
import { ru, type MessageKey } from "@/shared/i18n/messages/ru";
import { STORAGE_KEYS } from "@/shared/lib/storage";
import type { TimeUnits } from "@/shared/lib/time";

export type Locale = "ru" | "en" | "cs";
export type { MessageKey };

export const LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: "ru", label: "Русский", flag: "RU" },
  { code: "en", label: "English", flag: "EN" },
  { code: "cs", label: "Čeština", flag: "CS" },
];

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { ru, en, cs };
const DATE_LOCALE: Record<Locale, string> = { ru: "ru-RU", en: "en-GB", cs: "cs-CZ" };

export type Params = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: Params) => string;

export function isLocale(value: unknown): value is Locale {
  return value === "ru" || value === "en" || value === "cs";
}

function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Язык браузера → ru/en/cs; чешский и словацкий → cs, остальное → en. */
function browserLocale(): Locale {
  const tag = (typeof navigator !== "undefined" ? navigator.language : "ru").toLowerCase();
  if (tag.startsWith("ru") || tag.startsWith("uk") || tag.startsWith("be")) return "ru";
  if (tag.startsWith("cs") || tag.startsWith("sk")) return "cs";
  return "en";
}

function storedLocale(): Locale | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEYS.locale);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

interface I18nContextValue {
  locale: Locale;
  t: Translate;
  /** Явный выбор пользователя: запоминается в браузере (и, если передан onPersist, в профиле). */
  setLocale: (locale: Locale) => void;
  /** Язык из профиля сервера применяется, только если в браузере нет явного выбора. */
  adoptProfileLocale: (locale: string | null | undefined) => void;
  dateLocale: string;
}

const fallbackT: Translate = (key, params) => format(ru[key] ?? key, params);
const I18nContext = React.createContext<I18nContextValue>({
  locale: "ru",
  t: fallbackT,
  setLocale: () => {},
  adoptProfileLocale: () => {},
  dateLocale: DATE_LOCALE.ru,
});

export const I18nProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [locale, setLocaleState] = React.useState<Locale>("ru");

  React.useEffect(() => {
    setLocaleState(storedLocale() ?? browserLocale());
  }, []);

  React.useEffect(() => {
    setApiLocale(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEYS.locale, next);
    } catch {
      // приватный режим — выбор живёт до перезагрузки
    }
  }, []);

  const adoptProfileLocale = React.useCallback((value: string | null | undefined) => {
    if (isLocale(value) && !storedLocale()) setLocaleState(value);
  }, []);

  const value = React.useMemo<I18nContextValue>(() => {
    const dict = DICTIONARIES[locale];
    return {
      locale,
      t: (key, params) => format(dict[key] ?? ru[key] ?? key, params),
      setLocale,
      adoptProfileLocale,
      dateLocale: DATE_LOCALE[locale],
    };
  }, [locale, setLocale, adoptProfileLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  return React.useContext(I18nContext);
}

/** Сокращение для компонентов, которым нужен только перевод. */
export function useT(): Translate {
  return React.useContext(I18nContext).t;
}

/**
 * Выбор перевода записи контента из БД: payload.i18n[locale] поверх русского оригинала.
 * Нужен и вне React (экспорт PNG), поэтому — чистая функция.
 */
export function localized<P extends object>(payload: P, locale: Locale): P {
  const i18n = (payload as { i18n?: Partial<Record<Locale, Partial<P>>> }).i18n;
  return locale !== "ru" && i18n?.[locale] ? { ...payload, ...i18n[locale] } : payload;
}

/** Буквы единиц времени на текущем языке — для formatCountdown/formatDuration. */
export function timeUnits(t: Translate): TimeUnits {
  return { d: t("time.d"), h: t("time.h"), m: t("time.m"), s: t("time.s") };
}
