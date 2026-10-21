"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import type { ClanProfile } from "@/entities/clan";
import { STORAGE_KEYS, assetUrl, readStorage, UiGlyph, useT, writeStorage } from "@/shared";
import { SIDEBAR_KEYS, tabKeys, type NavTab, type TabKey } from "@/app/_shell/tabs";

interface NavProps {
  tabs: NavTab[];
  active: TabKey;
  onSelect: (key: TabKey) => void;
  /** Клан сессии: аватар и название сервера для раздела «Ваш клан». */
  clan?: ClanProfile | null;
}

/** Значок раздела: у «Вашего клана» — аватар Discord-сервера, иначе glyph. */
const TabIcon: React.FC<{ tab: NavTab; size: number; clan?: ClanProfile | null }> = ({ tab, size, clan }) => {
  const icon = tab.key === "clan" ? assetUrl(clan?.icon_url ?? null) : null;
  if (tab.key === "clan" && (icon || clan)) {
    return icon ? (
      // eslint-disable-next-line @next/next/no-img-element -- аватар Discord-сервера (CDN)
      <img src={icon} alt="" width={size} height={size} className="nav-clan-avatar" style={{ width: size, height: size }} />
    ) : (
      <span className="nav-clan-avatar nav-clan-letter" style={{ width: size, height: size, fontSize: size * 0.45 }}>{clan!.name.charAt(0).toUpperCase()}</span>
    );
  }
  return <UiGlyph icon={tab.icon} size={size} />;
};

/** Иконка «бургер» — три полосы в цвете акцента. */
const BurgerIcon: React.FC<{ size?: number; open?: boolean }> = ({ size = 30, open }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
    {open ? (
      <>
        <path d="M6 6l12 12" />
        <path d="M18 6L6 18" />
      </>
    ) : (
      <>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </>
    )}
  </svg>
);

/**
 * Меню всех разделов сайта. Рендерится порталом в body: у боковой панели есть
 * backdrop-filter, который ломает position: fixed у потомков.
 */
const BurgerMenu: React.FC<NavProps & { open: boolean; onClose: () => void }> = ({ tabs, active, onSelect, open, onClose, clan }) => {
  const t = useT();
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="burger-layer" onClick={onClose}>
      <div data-guide="shell-menu" className="burger-menu chrome" role="dialog" aria-modal="true" aria-label={t("nav.menu")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-1">
          <div>
            <div className="title-brand text-[0.95rem]">{t("nav.menu")}</div>
            <div className="hud-label chrome-muted">{t("nav.menuHint")}</div>
          </div>
          <button type="button" className="btn px-2" onClick={onClose} aria-label={t("common.close")}>
            <BurgerIcon size={22} open />
          </button>
        </div>
        <nav className="burger-grid" aria-label={t("nav.aria")}>
          {tabs.map((tab) => {
            const on = tab.key === active;
            return (
              <button
                key={tab.key}
                type="button"
                className={`burger-item ${on ? "is-active" : ""}`}
                aria-current={on ? "page" : undefined}
                onClick={() => {
                  onSelect(tab.key);
                  onClose();
                }}
              >
                <TabIcon tab={tab} size={34} clan={clan} />
                <span className="min-w-0 flex-1">
                  <span className="burger-item-label">{t(tabKeys(tab.key).label)}</span>
                  <span className="burger-item-hint">{tab.key === "clan" && clan ? `${clan.name} • ${t(tabKeys(tab.key).hint)}` : t(tabKeys(tab.key).hint)}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>,
    document.body,
  );
};

/** Сворачиваемое боковое меню: Инструменты, Обучение, Навигация + бургер со всеми разделами. */
export const Sidebar: React.FC<NavProps> = ({ tabs, active, onSelect, clan }) => {
  const t = useT();
  const [expanded, setExpanded] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const closeMenu = React.useCallback(() => setMenu(false), []);
  const pinned = tabs.filter((tab) => SIDEBAR_KEYS.includes(tab.key));
  const inMenu = !pinned.some((tab) => tab.key === active);

  React.useEffect(() => setExpanded(readStorage(STORAGE_KEYS.sidebar, false)), []);
  const toggle = () =>
    setExpanded((prev) => {
      writeStorage(STORAGE_KEYS.sidebar, !prev);
      return !prev;
    });

  return (
    <aside className="chrome sidebar-dock hidden shrink-0 flex-col gap-3 overflow-hidden rounded-md p-2.5 transition-[width] duration-300 ease-out md:sticky md:flex" style={{ width: expanded ? 280 : 85 }}>
      <div className={expanded ? "min-h-[46px] px-1" : "h-0 min-h-0"}>
        {expanded && (
          <div className="min-w-0 leading-tight">
            <div className="title-brand text-[0.95rem]">SINDARIS</div>
            <div className="hud-label chrome-muted">HQ • EST. 2024</div>
          </div>
        )}
      </div>

      <button data-guide="shell-collapse" className="btn w-full text-base" onClick={toggle} aria-label={expanded ? t("nav.collapse") : t("nav.expand")}>
        {expanded ? "❮" : "❯"}
      </button>

      <nav data-guide="shell-nav" className="scroll-area flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1" aria-label={t("nav.aria")}>
        {pinned.map((tab) => {
          const on = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              className={`nav-btn shrink-0 ${on ? "is-active" : ""} ${expanded ? "" : "justify-center px-0"}`}
              title={tab.key === "clan" && clan ? clan.name : t(tabKeys(tab.key).hint)}
              aria-current={on ? "page" : undefined}
              onClick={() => onSelect(tab.key)}
            >
              <TabIcon tab={tab} size={36} clan={clan} />
              {expanded && <span className="nav-label truncate">{t(tabKeys(tab.key).label)}</span>}
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        className={`nav-btn burger-btn ${inMenu ? "is-active" : ""} ${expanded ? "" : "justify-center px-0"}`}
        data-guide="shell-burger"
        onClick={() => setMenu(true)}
        title={t("nav.menuHint")}
        aria-haspopup="dialog"
        aria-expanded={menu}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center" style={{ color: "var(--accent)" }}>
          <BurgerIcon size={30} />
        </span>
        {expanded && (
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="nav-label">{t("nav.menu")}</span>
            <span className="hud-label chrome-muted truncate">{inMenu ? t(tabKeys(active).label) : t("nav.menuShort")}</span>
          </span>
        )}
      </button>
      <BurgerMenu tabs={tabs} active={active} onSelect={onSelect} open={menu} onClose={closeMenu} clan={clan} />
    </aside>
  );
};

export const MobileNav: React.FC<NavProps> = ({ tabs, active, onSelect, clan }) => {
  const t = useT();
  const [menu, setMenu] = React.useState(false);
  const closeMenu = React.useCallback(() => setMenu(false), []);
  const pinned = tabs.filter((tab) => SIDEBAR_KEYS.includes(tab.key));
  const inMenu = !pinned.some((tab) => tab.key === active);
  return (
    <nav className="chrome fixed inset-x-2 bottom-2 z-[60] grid auto-cols-fr grid-flow-col gap-1 rounded-md p-1.5 md:hidden" aria-label={t("nav.aria")}>
      {pinned.map((tab) => (
        <button key={tab.key} type="button" onClick={() => onSelect(tab.key)} className={`nav-btn h-14 flex-col justify-center gap-1 px-0 ${tab.key === active ? "is-active" : ""}`}>
          <TabIcon tab={tab} size={24} clan={clan} />
          <span className="hud-label max-w-full truncate text-[0.46rem] tracking-normal">{t(tabKeys(tab.key).short)}</span>
        </button>
      ))}
      <button type="button" className={`nav-btn h-14 flex-col justify-center gap-1 px-0 ${inMenu ? "is-active" : ""}`} onClick={() => setMenu(true)} aria-haspopup="dialog" aria-expanded={menu}>
        <span style={{ color: "var(--accent)" }}>
          <BurgerIcon size={24} />
        </span>
        <span className="hud-label text-[0.46rem] tracking-normal">{t("nav.menuShort")}</span>
      </button>
      <BurgerMenu tabs={tabs} active={active} onSelect={onSelect} open={menu} onClose={closeMenu} clan={clan} />
    </nav>
  );
};
