"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Icon, THEMES, UiGlyph, cn, matchesWords, useT, useTheme, type MessageKey, type Theme, type UiIcon } from "@/shared";
import { tabKeys, type TabKey } from "@/app/_shell/tabs";
import type { NavProps } from "@/app/_shell/Navigation";

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

const THEME_LABEL: Record<Theme, MessageKey> = {
  red: "settings.themeRed",
  lime: "settings.themeLime",
  dark: "settings.themeRed",
  light: "nav.themeSimple",
  amber: "settings.themeAmber",
  contrast: "settings.themeContrast",
  noir: "settings.themeNoir",
  soft: "settings.themeSoft",
  ascii: "settings.themeAscii",
};

/** Ctrl+K / ⌘K: быстрый переход к любому разделу, модулю и смена темы. */
export const CommandPalette: React.FC<NavProps & { open: boolean; onClose: () => void }> = ({ open, onClose, tabs, onSelect, tools, clanSections, clan }) => {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = React.useState("");
  const [index, setIndex] = React.useState(0);
  const listRef = React.useRef<HTMLUListElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Esc закрывает, даже если фокус ушёл из поля поиска
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onEsc);
    };
  }, [open, onClose]);

  const commands = React.useMemo<Command[]>(() => {
    const has = (key: TabKey) => tabs.some((x) => x.key === key);
    const glyph = (icon: UiIcon) => <UiGlyph icon={icon} size={18} />;
    const out: Command[] = [];
    const sections = t("palette.sections");
    if (has("tools")) {
      out.push({ id: "tools", group: sections, label: t("nav.tools.label"), hint: t("nav.tools.hint"), icon: glyph("tools"), run: () => onSelect("tools", null) });
      for (const m of tools) out.push({ id: `tool-${m.id}`, group: t("nav.tools.label"), label: t(m.label), hint: t(`tools.card.${m.id}.tagline` as MessageKey), icon: glyph(m.icon), run: () => onSelect("tools", m.id) });
    }
    if (has("clan")) {
      for (const s of clanSections) out.push({ id: `clan-${s.id}`, group: clan?.name ?? t("nav.clan.label"), label: t(s.label), hint: t(`nav.${s.id === "stockpiles" ? "timers" : s.id}.hint` as MessageKey), icon: glyph(s.icon), run: () => onSelect("clan", s.id) });
    }
    for (const key of ["guide", "feedback", "mail", "support", "cabinet"] as const) {
      const tab = tabs.find((x) => x.key === key);
      if (tab) out.push({ id: key, group: sections, label: t(tabKeys(key).label), hint: t(tabKeys(key).hint), icon: glyph(tab.icon), run: () => onSelect(key) });
    }
    for (const th of THEMES) {
      out.push({
        id: `theme-${th}`,
        group: t("settings.appearance"),
        label: `${t("palette.theme")}: ${t(THEME_LABEL[th])}`,
        hint: th === theme ? t("settings.active") : undefined,
        icon: <Icon name="palette" size={18} />,
        run: () => setTheme(th),
      });
    }
    return out;
  }, [tabs, tools, clanSections, clan, onSelect, t, theme, setTheme]);

  const shown = React.useMemo(() => (query.trim() ? commands.filter((c) => matchesWords(`${c.label} ${c.group} ${c.hint ?? ""}`, query)) : commands), [commands, query]);
  const current = Math.min(index, Math.max(0, shown.length - 1));

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  if (!open || typeof document === "undefined") return null;

  const runAt = (i: number) => {
    const cmd = shown[i];
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(current);
    }
  };

  let lastGroup = "";
  return createPortal(
    <div className="palette-layer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t("palette.title")} onKeyDown={onKey}>
        <label className="palette-search">
          <Icon name="search" size={18} className="text-fg-3" />
          <input
            autoFocus
            className="palette-input"
            placeholder={t("palette.placeholder")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            aria-controls="palette-list"
            aria-activedescendant={shown[current] ? `palette-${shown[current].id}` : undefined}
          />
          <kbd className="palette-kbd">Esc</kbd>
        </label>
        <ul id="palette-list" ref={listRef} className="palette-list" role="listbox">
          {shown.length === 0 ? <li className="palette-empty">{t("common.nothingFound")}</li> : null}
          {shown.map((c, i) => {
            const head = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <React.Fragment key={c.id}>
                {head ? <li className="palette-group" role="presentation">{head}</li> : null}
                <li
                  id={`palette-${c.id}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === current}
                  className={cn("palette-item", i === current && "is-active")}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => runAt(i)}
                >
                  <span className="palette-item-icon">{c.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {c.hint ? <span className="palette-item-hint">{c.hint}</span> : null}
                  {i === current ? <Icon name="chevronRight" size={15} className="text-fg-3" /> : null}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
        <div className="palette-foot">
          <span><kbd className="palette-kbd">↑</kbd><kbd className="palette-kbd">↓</kbd> {t("palette.move")}</span>
          <span><kbd className="palette-kbd">Enter</kbd> {t("palette.open")}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
};

/** Горячая клавиша палитры: Ctrl+K / ⌘K, а также «/» вне полей ввода. */
export function usePaletteHotkey(onOpen: () => void) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((e.key === "k" || e.key === "K" || e.key === "л" || e.key === "Л") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onOpen();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);
}
