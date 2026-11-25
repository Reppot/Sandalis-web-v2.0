"use client";

import * as React from "react";
import { STORAGE_KEYS } from "@/shared/lib/storage";

/**
 * Темы сайта — наборы токенов (app/styles/tokens.css). html[data-theme] — основа
 * (dark / light), html[data-skin] — палитра поверх основы. Без сохранённого выбора
 * тема следует системной (светлая / тёмная).
 */
export type Theme = "red" | "lime" | "dark" | "light" | "amber" | "contrast" | "noir" | "soft" | "ascii";
export const THEMES: readonly Theme[] = ["red", "lime", "light", "amber", "contrast", "noir", "soft", "ascii"];

const BASE: Record<Theme, "dark" | "light"> = { red: "dark", lime: "dark", dark: "dark", light: "light", amber: "dark", contrast: "dark", noir: "light", soft: "light", ascii: "dark" };

function apply(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", BASE[theme]);
  if (theme === "light") root.removeAttribute("data-skin");
  else root.setAttribute("data-skin", theme === "dark" ? "red" : theme);
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue>({ theme: "red", setTheme: () => {}, toggleTheme: () => {} });

export const ThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [theme, setThemeState] = React.useState<Theme>("red");
  const channelRef = React.useRef<BroadcastChannel | null>(null);

  React.useEffect(() => {
    const root = document.documentElement;
    const normalize = (value: string | null | undefined): Theme => value === "dark" ? "red" : value && THEMES.includes(value as Theme) ? value as Theme : "red";
    const publish = (next: Theme) => {
      root.setAttribute("data-theme", BASE[next]);
      if (next === "light") root.removeAttribute("data-skin");
      else root.setAttribute("data-skin", next);
      setThemeState(next);
    };
    const skin = root.getAttribute("data-skin");
    const initial = normalize(skin ?? (root.getAttribute("data-theme") === "light" ? "light" : null));
    publish(initial);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("chronomancer-theme");
    channelRef.current = channel;
    if (channel) channel.onmessage = (event: MessageEvent<string>) => publish(normalize(event.data));
    const syncTheme = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEYS.theme && event.key !== null) return;
      let stored = event.newValue;
      if (stored === null || stored === undefined) {
        try { stored = window.localStorage.getItem(STORAGE_KEYS.theme); } catch { stored = null; }
      }
      publish(normalize(stored));
    };
    window.addEventListener("storage", syncTheme);
    window.parent.postMessage({ type: "chronomancer:theme-change", theme: initial }, "*");
    return () => { window.removeEventListener("storage", syncTheme); channel?.close(); channelRef.current = null; };
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    apply(next);
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEYS.theme, next);
    } catch {
      // приватный режим — тема живёт до перезагрузки
    }
    try {
      channelRef.current?.postMessage(next);
    } catch { /* BroadcastChannel может быть отключён политиками браузера */ }
    window.parent.postMessage({ type: "chronomancer:theme-change", theme: next }, "*");
  }, []);
  const toggleTheme = React.useCallback(() => setTheme(theme === "light" ? "red" : "light"), [theme, setTheme]);

  const value = React.useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  return React.useContext(ThemeContext);
}

/** Инлайн-скрипт: тема до первой отрисовки, без мерцания. */
export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement;d.setAttribute("data-desktop-host",location.protocol==="app:"?"true":"false");try{var t=localStorage.getItem("${STORAGE_KEYS.theme}");if(localStorage.getItem("${STORAGE_KEYS.themeDefaultMigration}")!=="red-v1"){t="red";localStorage.setItem("${STORAGE_KEYS.theme}",t);localStorage.setItem("${STORAGE_KEYS.themeDefaultMigration}","red-v1")}if(t==="dark")t="red";var b={red:"dark",lime:"dark",light:"light",amber:"dark",contrast:"dark",noir:"light",soft:"light",ascii:"dark"};if(!b[t])t="red";d.setAttribute("data-theme",b[t]);if(t==="light")d.removeAttribute("data-skin");else d.setAttribute("data-skin",t)}catch(e){d.setAttribute("data-theme","dark");d.setAttribute("data-skin","red")}})();`;

export const ThemeIcon: React.FC<{ theme: Theme; size?: number }> = ({ theme, size = 30 }) => {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (theme) {
    case "ascii":
      return (
        <svg {...common}>
          <text x="4" y="7" fill="currentColor" stroke="none" fontFamily="ui-monospace, monospace" fontSize="4.5" fontWeight="700">01 10</text>
          <text x="4" y="12" fill="currentColor" stroke="none" fontFamily="ui-monospace, monospace" fontSize="4.5" fontWeight="700">10 01</text>
          <text x="4" y="17" fill="currentColor" stroke="none" fontFamily="ui-monospace, monospace" fontSize="4.5" fontWeight="700">11 00</text>
        </svg>
      );
    case "lime":
      return (
        <svg {...common}>
          <path d="M20 4c-8 .2-13.5 2.4-15.4 7.1-1.4 3.5.4 7.2 3.8 7.2C15.1 18.3 18.7 12.7 20 4Z" />
          <path d="M5 19c3.1-4.1 6.6-7.3 11.5-10.4" />
        </svg>
      );
    case "red":
    case "dark":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      );
    case "light":
      return (
        <svg {...common}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );
    case "contrast":
      return (
        <svg {...common}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "noir":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
        </svg>
      );
    case "amber":
      return (
        <svg {...common}>
          <path d="M12 3c2.5 3.2 5 5.9 5 9.5A5 5 0 0 1 7 12.5c0-1.6.6-3 1.6-4.2.2 1.6 1 2.6 2.1 2.9C10.4 8.6 11 5.6 12 3z" />
        </svg>
      );
    case "soft":
      return (
        <svg {...common}>
          <path d="M12 21s-7-4.35-9.5-8.5C.8 9.4 2.6 5.5 6.3 5.5c2.1 0 3.4 1.2 4.2 2.4h1c.8-1.2 2.1-2.4 4.2-2.4 3.7 0 5.5 3.9 3.8 7C19 16.65 12 21 12 21z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      );
  }
};
