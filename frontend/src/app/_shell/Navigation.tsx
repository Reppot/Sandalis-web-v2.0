"use client";

import * as React from "react";
import { STORAGE_KEYS, ThemeIcon, readStorage, uiIcon, useT, useTheme, writeStorage } from "@/shared";
import { tabKeys, type NavTab, type TabKey } from "@/app/_shell/tabs";

interface NavProps {
  tabs: NavTab[];
  active: TabKey;
  onSelect: (key: TabKey) => void;
}

/** Сворачиваемое боковое меню старого терминала — переключает вкладки v2. */
export const Sidebar: React.FC<NavProps> = ({ tabs, active, onSelect }) => {
  const t = useT();
  const { theme, toggleTheme } = useTheme();
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => setExpanded(readStorage(STORAGE_KEYS.sidebar, false)), []);
  const toggle = () =>
    setExpanded((prev) => {
      writeStorage(STORAGE_KEYS.sidebar, !prev);
      return !prev;
    });

  return (
    <aside className="chrome hidden h-[calc(100dvh-1.5rem)] max-h-dvh shrink-0 flex-col gap-3 overflow-hidden rounded-md p-2.5 transition-[width] duration-300 ease-out md:sticky md:top-3 md:flex" style={{ width: expanded ? 280 : 85 }}>
      <div className={expanded ? "min-h-[46px] px-1" : "h-0 min-h-0"}>
        {expanded && (
          <div className="min-w-0 leading-tight">
            <div className="title-brand text-[0.95rem]">SINDARIS</div>
            <div className="hud-label chrome-muted">HQ • EST. 2024</div>
          </div>
        )}
      </div>

      <button className="btn w-full text-base" onClick={toggle} aria-label={expanded ? t("nav.collapse") : t("nav.expand")}>
        {expanded ? "❮" : "❯"}
      </button>

      <nav className="scroll-area flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1" aria-label={t("nav.aria")}>
        {tabs.map((tab) => {
          const on = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              className={`nav-btn shrink-0 ${on ? "is-active" : ""} ${expanded ? "" : "justify-center px-0"}`}
              title={t(tabKeys(tab.key).hint)}
              aria-current={on ? "page" : undefined}
              onClick={() => onSelect(tab.key)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={uiIcon(tab.icon)} alt="" width={36} height={36} className="ui-icon" />
              {expanded && <span className="nav-label truncate">{t(tabKeys(tab.key).label)}</span>}
            </button>
          );
        })}
      </nav>

      <button className={`nav-btn ${expanded ? "" : "justify-center px-0"}`} onClick={toggleTheme} title={theme === "dark" ? t("nav.themeLight") : t("nav.themeDark")}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center" style={{ color: "var(--accent)" }}>
          <ThemeIcon theme={theme} />
        </span>
        {expanded && (
          <span className="flex flex-col items-start leading-tight">
            <span className="nav-label">{t("nav.theme")}</span>
            <span className="hud-label chrome-muted">{theme === "dark" ? t("nav.themeNight") : t("nav.themeSimple")}</span>
          </span>
        )}
      </button>
    </aside>
  );
};

export const MobileNav: React.FC<NavProps> = ({ tabs, active, onSelect }) => {
  const t = useT();
  const { theme, toggleTheme } = useTheme();
  return (
    <nav className="chrome fixed inset-x-2 bottom-2 z-[60] grid grid-cols-8 gap-1 rounded-md p-1.5 md:hidden" aria-label={t("nav.aria")}>
      {tabs.map((tab) => (
        <button key={tab.key} type="button" onClick={() => onSelect(tab.key)} className={`nav-btn h-14 flex-col justify-center gap-1 px-0 ${tab.key === active ? "is-active" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={uiIcon(tab.icon)} alt="" width={24} height={24} className="ui-icon" style={{ width: 24, height: 24 }} />
          <span className="hud-label max-w-full truncate text-[0.46rem] tracking-normal">{t(tabKeys(tab.key).short)}</span>
        </button>
      ))}
      <button className="nav-btn h-14 flex-col justify-center gap-1 px-0" onClick={toggleTheme}>
        <span style={{ color: "var(--accent)" }}>
          <ThemeIcon theme={theme} size={22} />
        </span>
        <span className="hud-label text-[0.46rem] tracking-normal">{t("nav.theme")}</span>
      </button>
    </nav>
  );
};
