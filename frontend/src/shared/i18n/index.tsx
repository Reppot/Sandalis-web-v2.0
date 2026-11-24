"use client";

import * as React from "react";
import { setApiLocale } from "@/shared/api/client";
import { cs } from "@/shared/i18n/messages/cs";
import { de } from "@/shared/i18n/messages/de";
import { en } from "@/shared/i18n/messages/en";
import { es } from "@/shared/i18n/messages/es";
import { fr } from "@/shared/i18n/messages/fr";
import { pl } from "@/shared/i18n/messages/pl";
import { pt } from "@/shared/i18n/messages/pt";
import { ru, type MessageKey } from "@/shared/i18n/messages/ru";
import { uk } from "@/shared/i18n/messages/uk";
import { zh } from "@/shared/i18n/messages/zh";
import { STORAGE_KEYS } from "@/shared/lib/storage";
import type { TimeUnits } from "@/shared/lib/time";

export type Locale = "ru" | "en" | "uk" | "de" | "pl" | "fr" | "es" | "pt" | "cs" | "zh";
export type { MessageKey };

/** Языки интерфейса: самоназвание и короткий код для переключателя. */
export const LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: "ru", label: "Русский", flag: "RU" },
  { code: "en", label: "English", flag: "EN" },
  { code: "uk", label: "Українська", flag: "UA" },
  { code: "de", label: "Deutsch", flag: "DE" },
  { code: "pl", label: "Polski", flag: "PL" },
  { code: "fr", label: "Français", flag: "FR" },
  { code: "es", label: "Español", flag: "ES" },
  { code: "pt", label: "Português (Brasil)", flag: "BR" },
  { code: "cs", label: "Čeština", flag: "CZ" },
  { code: "zh", label: "简体中文", flag: "中文" },
];

const DICTIONARIES: Record<Locale, Partial<Record<MessageKey, string>>> = { ru, en, uk, de, pl, fr, es, pt, cs, zh };
const DATE_LOCALE: Record<Locale, string> = {
  ru: "ru-RU", en: "en-GB", uk: "uk-UA", de: "de-DE", pl: "pl-PL", fr: "fr-FR", es: "es-ES", pt: "pt-BR", cs: "cs-CZ", zh: "zh-CN",
};
const CODES = new Set<string>(LOCALES.map((l) => l.code));

export type Params = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: Params) => string;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && CODES.has(value);
}

function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Язык браузера → язык интерфейса: белорусский → ru, словацкий → cs, португальский → pt-BR; неизвестный → en. */
function browserLocale(): Locale {
  const tag = (typeof navigator !== "undefined" ? navigator.language : "ru").toLowerCase();
  const primary = tag.split("-")[0];
  if (primary === "be") return "ru";
  if (primary === "sk") return "cs";
  return isLocale(primary) ? primary : "en";
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
      // нет перевода — английский, а для него — русский оригинал
      t: (key, params) => format(dict[key] ?? en[key] ?? ru[key] ?? key, params),
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
 * Выбор перевода записи контента из БД: payload.i18n[locale] поверх русского оригинала;
 * нет перевода на этот язык — английский. Нужен и вне React (экспорт PNG), поэтому — чистая функция.
 */
export function localized<P extends object>(payload: P, locale: Locale): P {
  if (locale === "ru") return payload;
  const i18n = (payload as { i18n?: Partial<Record<Locale, Partial<P>>> }).i18n;
  const tr = i18n?.[locale] ?? i18n?.en;
  return tr ? { ...payload, ...tr } : payload;
}

/** Буквы единиц времени на текущем языке — для formatCountdown/formatDuration. */
export function timeUnits(t: Translate): TimeUnits {
  return { d: t("time.d"), h: t("time.h"), m: t("time.m"), s: t("time.s") };
}
