"use client";

import * as React from "react";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import type { UiIcon } from "@/shared/config/assets";
import { ItemIcon } from "@/shared/ui/controls";
import { UiGlyph } from "@/shared/ui/glyph";

// --------------------------------------------------------------------------- //
// Сворачивание двух окон (калькуляторы, «Заказы»)
// --------------------------------------------------------------------------- //
/** Какое окно развёрнуто на всю ширину ("" — открыты оба). */
export type PaneWide = "" | "first" | "second";

export interface Panes {
  first: boolean;
  second: boolean;
  wide: PaneWide;
  toggleFirst: () => void;
  toggleSecond: () => void;
}

/** Два окна, одно всегда остаётся открытым; оставшееся занимает всю ширину. */
export function usePanes(): Panes {
  const [first, setFirst] = React.useState(true);
  const [second, setSecond] = React.useState(true);
  return {
    first,
    second,
    wide: first && !second ? "first" : second && !first ? "second" : "",
    toggleFirst: () => setFirst((v) => !v || !second),
    toggleSecond: () => setSecond((v) => !v || !first),
  };
}

/** Две крупные кнопки «окно открыто / свёрнуто». */
export const PaneToggles: React.FC<{ panes: Panes; first: { label: string; icon: string }; second: { label: string; icon: string }; guide?: string }> = ({ panes, first, second, guide }) => {
  const t = useT();
  const item = (on: boolean, pane: { label: string; icon: string }, toggle: () => void, last: boolean) => (
    <button type="button" className={`pane-toggle ${on ? "is-on" : "is-off"}`} aria-pressed={on} onClick={toggle} title={on && last ? t("tools.paneLast") : t("tools.paneHint")}>
      <span className="pane-toggle-icon" aria-hidden>{pane.icon}</span>
      <span className="pane-toggle-label">{pane.label}</span>
      <span className="pane-toggle-state">{on ? `▣ ${t("tools.paneOn")}` : `▢ ${t("tools.paneOff")}`}</span>
    </button>
  );
  return (
    <div data-guide={guide ?? "panes"} className="pane-toggles" role="group" aria-label={t("tools.paneHint")}>
      {item(panes.first, first, panes.toggleFirst, !panes.second)}
      {item(panes.second, second, panes.toggleSecond, !panes.first)}
    </div>
  );
};

// --------------------------------------------------------------------------- //
// Фильтры-карточки над поиском
// --------------------------------------------------------------------------- //
export interface FilterCardItem {
  key: string;
  label: string;
  /** Картинка (иконка предмета/постройки) или glyph интерфейса. */
  icon?: string | null;
  glyph?: UiIcon;
  /** Подпись под названием: «предметов: 12». */
  hint?: string;
}

/**
 * Сетка карточек-фильтров. Повторный клик по выбранной карточке вызывает onChange(null)
 * — вызывающий решает, что это значит (свернуть список или вернуть «Все»).
 * compact — маленькие карточки без иконок (фракции).
 */
export const FilterCards: React.FC<{ items: FilterCardItem[]; value: string | null; onChange: (key: string | null) => void; compact?: boolean; guide?: string; label?: string }> = ({ items, value, onChange, compact, guide, label }) => (
  <div data-guide={guide} className={cn("filter-cards", compact && "is-compact")} role="group" aria-label={label}>
    {items.map((item) => {
      const on = value === item.key;
      return (
        <button key={item.key} type="button" className={cn("filter-card", on && "is-active")} aria-pressed={on} onClick={() => onChange(on ? null : item.key)}>
          {compact ? null : item.icon ? <ItemIcon sources={[item.icon]} size={40} label={item.label} /> : <UiGlyph icon={item.glyph ?? "search"} size={40} />}
          <span className="min-w-0 flex-1">
            <span className="filter-card-name">{item.label}</span>
            {item.hint ? <span className="filter-card-hint">{item.hint}</span> : null}
          </span>
        </button>
      );
    })}
  </div>
);
