"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import type { ClanProfile } from "@/entities/clan";
import { STORAGE_KEYS, assetUrl, cn, readStorage, UiGlyph, useT, writeStorage, type MessageKey, type UiIcon } from "@/shared";
import { MOBILE_KEYS, tabKeys, type NavTab, type TabKey } from "@/app/_shell/tabs";

/** Пункт вложенного меню: модуль «Инструментов» или подраздел «Вашего клана». */
export interface NavChild {
  id: string;
  icon: UiIcon;
  label: MessageKey;
  isNew?: boolean;
}

export interface NavProps {
  tabs: NavTab[];
  active: TabKey;
  /** sub — модуль инструментов / подраздел клана. */
  onSelect: (key: TabKey, sub?: string | null) => void;
  clan?: ClanProfile | null;
  tools: NavChild[];
  activeTool: string | null;
  clanSections: NavChild[];
  activeClanView: string;
  user: { name: string; avatar: string | null };
  /** Герб клана из реестра медиа. */
  logo?: string | null;
}

/** Значок раздела: у «Вашего клана» — аватар Discord-сервера, иначе glyph. */
const TabIcon: React.FC<{ tab: NavTab; size: number; clan?: ClanProfile | null }> = ({ tab, size, clan }) => {
  const icon = tab.key === "clan" ? assetUrl(clan?.icon_url ?? null) : null;
  if (tab.key === "clan" && (icon || clan)) {
    return icon ? (
      // eslint-disable-next-line @next/next/no-img-element -- аватар Discord-сервера (CDN)
      <img src={icon} alt="" width={size} height={size} className="nav-clan-avatar" style={{ width: size, height: size }} />
    ) : (
      <span className="nav-clan-avatar nav-clan-letter" style={{ width: size, height: size, fontSize: size * 0.5 }}>{clan!.name.charAt(0).toUpperCase()}</span>
    );
  }
  return <UiGlyph icon={tab.icon} size={size} className="nav-glyph" />;
};

const Avatar: React.FC<{ name: string; src: string | null; size: number }> = ({ name, src, size }) =>
  src ? (
    // eslint-disable-next-line @next/next/no-img-element -- аватар Discord (CDN)
    <img src={src} alt="" width={size} height={size} className="nav-avatar" style={{ width: size, height: size }} />
  ) : (
    <span className="nav-avatar nav-avatar-letter" style={{ width: size, height: size, fontSize: size * 0.45 }}>{name.charAt(0).toUpperCase() || "?"}</span>
  );

const Chevron: React.FC<{ dir: "left" | "right" }> = ({ dir }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {dir === "left" ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
  </svg>
);

/** Ссылка меню: на ПК — строка с подписью, в свёрнутом виде — только значок с подсказкой. */
const NavItem: React.FC<{
  on: boolean;
  label: string;
  title?: string;
  icon: React.ReactNode;
  collapsed: boolean;
  nested?: boolean;
  badge?: string | null;
  onClick: () => void;
  guide?: string;
}> = ({ on, label, title, icon, collapsed, nested, badge, onClick, guide }) => (
  <button
    type="button"
    data-guide={guide}
    className={cn("nav-item", nested && "is-nested", on && "is-active")}
    aria-current={on ? "page" : undefined}
    title={collapsed ? label : title}
    onClick={onClick}
  >
    <span className="nav-item-icon">{icon}</span>
    {collapsed ? null : <span className="nav-item-label">{label}</span>}
    {!collapsed && badge ? <span className="nav-item-badge">{badge}</span> : null}
  </button>
);

/** Боковое меню ПК: все разделы с подписями, модули инструментов и подразделы клана — вложенными. */
export const Sidebar: React.FC<NavProps> = ({ tabs, active, onSelect, clan, tools, activeTool, clanSections, activeClanView, user, logo }) => {
  const t = useT();
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => setCollapsed(readStorage<unknown>(STORAGE_KEYS.sidebar, null) === "collapsed"), []);
  const toggle = () =>
    setCollapsed((prev) => {
      writeStorage(STORAGE_KEYS.sidebar, prev ? null : "collapsed");
      return !prev;
    });

  const has = (key: TabKey) => tabs.some((x) => x.key === key);
  const tab = (key: TabKey) => tabs.find((x) => x.key === key)!;
  const label = (key: TabKey) => t(tabKeys(key).label);
  const settingsOn = active === "cabinet";

  return (
    <aside className={cn("sidebar", collapsed && "is-collapsed")} aria-label={t("nav.aria")}>
      <div className="sidebar-head">
        <button type="button" data-guide="shell-brand" className="sidebar-brand" onClick={() => onSelect("tools", null)} title="SINDARIS">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- герб из реестра медиа
            <img src={logo} alt="" width={34} height={34} className="sidebar-logo" />
          ) : (
            <BrandMark />
          )}
          {collapsed ? null : (
            <span className="min-w-0 leading-none">
              <span className="sidebar-brand-name">SINDARIS</span>
              <span className="sidebar-brand-sub">{t("header.terminal")}</span>
            </span>
          )}
        </button>
      </div>

      <nav data-guide="shell-nav" className="sidebar-scroll">
        {has("tools") ? (
          <div className="nav-group">
            <NavItem on={active === "tools" && !activeTool} label={label("tools")} title={t(tabKeys("tools").hint)} icon={<TabIcon tab={tab("tools")} size={18} />} collapsed={collapsed} onClick={() => onSelect("tools", null)} />
            {tools.map((m) => (
              <NavItem
                key={m.id}
                nested
                on={active === "tools" && activeTool === m.id}
                label={t(m.label)}
                icon={<UiGlyph icon={m.icon} size={18} className="nav-glyph" />}
                badge={m.isNew ? t("tools.badgeNew") : null}
                collapsed={collapsed}
                onClick={() => onSelect("tools", m.id)}
              />
            ))}
          </div>
        ) : null}

        {has("clan") ? (
          <div className="nav-group">
            {collapsed ? <div className="nav-sep" /> : <div className="nav-group-title">{clan?.name ?? label("clan")}</div>}
            {clanSections.map((s) => (
              <NavItem
                key={s.id}
                on={active === "clan" && activeClanView === s.id}
                label={t(s.label)}
                icon={<UiGlyph icon={s.icon} size={18} className="nav-glyph" />}
                collapsed={collapsed}
                onClick={() => onSelect("clan", s.id)}
              />
            ))}
          </div>
        ) : null}

        <div className="nav-group">
          {collapsed ? <div className="nav-sep" /> : <div className="nav-group-title">{t("nav.siteGroup")}</div>}
          {(["guide", "feedback", "mail", "support"] as const).filter(has).map((key) => (
            <NavItem key={key} on={active === key} label={label(key)} title={t(tabKeys(key).hint)} icon={<TabIcon tab={tab(key)} size={18} />} collapsed={collapsed} onClick={() => onSelect(key)} />
          ))}
        </div>
      </nav>

      <div className="sidebar-foot">
        {has("cabinet") ? (
          <button type="button" className={cn("sidebar-user", settingsOn && "is-active")} aria-current={settingsOn ? "page" : undefined} onClick={() => onSelect("cabinet")} title={label("cabinet")}>
            <Avatar name={user.name} src={user.avatar} size={30} />
            {collapsed ? null : (
              <span className="min-w-0 flex-1 text-left leading-tight">
                <span className="sidebar-user-name">{user.name}</span>
                <span className="sidebar-user-sub">{label("cabinet")}</span>
              </span>
            )}
          </button>
        ) : null}
        <button data-guide="shell-collapse" type="button" className="sidebar-collapse" onClick={toggle} aria-label={collapsed ? t("nav.expand") : t("nav.collapse")} title={collapsed ? t("nav.expand") : t("nav.collapse")}>
          <Chevron dir={collapsed ? "right" : "left"} />
        </button>
      </div>
    </aside>
  );
};

/** Монограмма, пока герб из реестра медиа не загрузился. */
const BrandMark: React.FC = () => (
  <span className="sidebar-mark" aria-hidden>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 7.5c-.9-1.4-2.6-2.2-4.6-2.2-2.7 0-4.4 1.4-4.4 3.3 0 4.4 9.3 2.6 9.3 7.1 0 2-1.9 3.4-4.7 3.4-2.2 0-4-.9-4.9-2.5" />
    </svg>
  </span>
);

/** Иконка «ещё» — три точки. */
const MoreIcon: React.FC = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);

/** Лист «Все разделы» на телефоне: снизу, как в iOS. Порталом в body (fixed не ломается). */
const MoreSheet: React.FC<NavProps & { open: boolean; onClose: () => void }> = ({ tabs, active, onSelect, open, onClose, clan, tools, activeTool, clanSections, activeClanView }) => {
  const t = useT();
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  const go = (key: TabKey, sub: string | null = null) => {
    onSelect(key, sub);
    onClose();
  };
  const has = (key: TabKey) => tabs.some((x) => x.key === key);
  const row = (key: string, on: boolean, icon: React.ReactNode, label: string, onClick: () => void, hint?: string) => (
    <button key={key} type="button" className={cn("sheet-row", on && "is-active")} aria-current={on ? "page" : undefined} onClick={onClick}>
      <span className="sheet-row-icon">{icon}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="sheet-row-label">{label}</span>
        {hint ? <span className="sheet-row-hint">{hint}</span> : null}
      </span>
    </button>
  );
  return createPortal(
    <div className="sheet-layer" onClick={onClose}>
      <div data-guide="shell-menu" className="sheet" role="dialog" aria-modal="true" aria-label={t("nav.menu")} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" aria-hidden />
        <div className="sheet-head">
          <span className="sheet-title">{t("nav.menuHint")}</span>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t("common.close")}>✕</button>
        </div>
        <nav className="sheet-body" aria-label={t("nav.aria")}>
          {has("tools") ? (
            <section className="sheet-group">
              {row("tools", active === "tools" && !activeTool, <UiGlyph icon="tools" size={20} />, t("nav.tools.label"), () => go("tools"), t("nav.tools.hint"))}
              {tools.map((m) => row(`tool-${m.id}`, active === "tools" && activeTool === m.id, <UiGlyph icon={m.icon} size={20} />, t(m.label), () => go("tools", m.id)))}
            </section>
          ) : null}
          {has("clan") ? (
            <section className="sheet-group">
              <div className="sheet-group-title">{clan?.name ?? t("nav.clan.label")}</div>
              {clanSections.map((s) => row(`clan-${s.id}`, active === "clan" && activeClanView === s.id, <UiGlyph icon={s.icon} size={20} />, t(s.label), () => go("clan", s.id)))}
            </section>
          ) : null}
          <section className="sheet-group">
            <div className="sheet-group-title">{t("nav.siteGroup")}</div>
            {tabs
              .filter((x) => x.key !== "tools" && x.key !== "clan")
              .map((x) => row(x.key, active === x.key, <TabIcon tab={x} size={20} clan={clan} />, t(tabKeys(x.key).label), () => go(x.key), t(tabKeys(x.key).hint)))}
          </section>
        </nav>
      </div>
    </div>,
    document.body,
  );
};

/** Нижний таб-бар телефона: четыре раздела + «Ещё» со всеми разделами и модулями. */
export const MobileNav: React.FC<NavProps> = (props) => {
  const { tabs, active, onSelect, clan } = props;
  const t = useT();
  const [menu, setMenu] = React.useState(false);
  const closeMenu = React.useCallback(() => setMenu(false), []);
  const pinned = tabs.filter((tab) => MOBILE_KEYS.includes(tab.key));
  const inMenu = !pinned.some((tab) => tab.key === active);
  return (
    <>
      <nav className="tabbar md:hidden" aria-label={t("nav.aria")}>
        {pinned.map((tab) => (
          <button key={tab.key} type="button" onClick={() => onSelect(tab.key)} className={cn("tabbar-item", tab.key === active && "is-active")} aria-current={tab.key === active ? "page" : undefined}>
            <TabIcon tab={tab} size={22} clan={clan} />
            <span className="tabbar-label">{t(tabKeys(tab.key).short)}</span>
          </button>
        ))}
        <button type="button" className={cn("tabbar-item", inMenu && "is-active")} onClick={() => setMenu(true)} aria-haspopup="dialog" aria-expanded={menu}>
          <MoreIcon />
          <span className="tabbar-label">{t("nav.menuShort")}</span>
        </button>
      </nav>
      <MoreSheet {...props} open={menu} onClose={closeMenu} />
    </>
  );
};
