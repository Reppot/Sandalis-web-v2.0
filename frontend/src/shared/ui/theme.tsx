"use client";

import * as React from "react";
import { STORAGE_KEYS } from "@/shared/lib/storage";

/**
 * Темы сайта — наборы токенов (app/styles/tokens.css). html[data-theme] — основа
 * (dark / light), html[data-skin] — палитра поверх основы. Без сохранённого выбора
 * тема следует системной (светлая / тёмная).
 */
export type Theme = "dark" | "light" | "amber" | "contrast" | "noir" | "soft";
export const THEMES: readonly Theme[] = ["dark", "light", "amber", "contrast", "noir", "soft"];

const BASE: Record<Theme, "dark" | "light"> = { dark: "dark", light: "light", amber: "dark", contrast: "dark", noir: "light", soft: "light" };

function apply(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", BASE[theme]);
  if (theme === "dark" || theme === "light") root.removeAttribute("data-skin");
  else root.setAttribute("data-skin", theme);
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue>({ theme: "dark", setTheme: () => {}, toggleTheme: () => {} });

export const ThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [theme, setThemeState] = React.useState<Theme>("dark");

  React.useEffect(() => {
    const root = document.documentElement;
    const skin = root.getAttribute("data-skin") as Theme | null;
    setThemeState(skin && THEMES.includes(skin) ? skin : root.getAttribute("data-theme") === "light" ? "light" : "dark");
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    apply(next);
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEYS.theme, next);
    } catch {
      // приватный режим — тема живёт до перезагрузки
    }
  }, []);
  const toggleTheme = React.useCallback(() => setTheme(theme === "light" ? "dark" : "light"), [theme, setTheme]);

  const value = React.useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  return React.useContext(ThemeContext);
}

/** Инлайн-скрипт: тема до первой отрисовки, без мерцания. */
export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem("${STORAGE_KEYS.theme}");var b={dark:"dark",light:"light",amber:"dark",contrast:"dark",noir:"light",soft:"light"};if(!b[t]){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}d.setAttribute("data-theme",b[t]);if(t!=="dark"&&t!=="light"){d.setAttribute("data-skin",t)}}catch(e){d.setAttribute("data-theme","dark")}})();`;

export const ThemeIcon: React.FC<{ theme: Theme; size?: number }> = ({ theme, size = 30 }) => {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (theme) {
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
