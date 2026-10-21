"use client";

import * as React from "react";
import { useT } from "@/shared";

/** Какое окно калькулятора развёрнуто на всю ширину ("" — открыты оба). */
export type PaneWide = "" | "catalog" | "plan";

export interface Panes {
  catalog: boolean;
  plan: boolean;
  wide: PaneWide;
  toggleCatalog: () => void;
  togglePlan: () => void;
}

/** Сворачивание окон как во вкладке «Заказы»: одно окно всегда остаётся открытым. */
export function usePanes(): Panes {
  const [catalog, setCatalog] = React.useState(true);
  const [plan, setPlan] = React.useState(true);
  return {
    catalog,
    plan,
    wide: catalog && !plan ? "catalog" : plan && !catalog ? "plan" : "",
    toggleCatalog: () => setCatalog((v) => !v || !plan),
    togglePlan: () => setPlan((v) => !v || !catalog),
  };
}

/** Сетка окон: data-wide включает крупный текст и иконки в оставшемся окне (globals.css). */
export const paneGridClass = (p: Panes) =>
  `tool-panes grid min-h-0 flex-1 items-start gap-4 ${p.catalog && p.plan ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" : ""}`;

/** Карточки предметов: 3 в ряд рядом с итогами, больше — когда каталог один. */
export const paneCardsClass = (p: Panes) => `mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 ${p.wide === "catalog" ? "lg:grid-cols-4 2xl:grid-cols-5" : ""}`;

/** Две крупные кнопки «окно открыто / свёрнуто» над калькулятором. */
export const PaneToggles: React.FC<{ panes: Panes; catalogLabel: string; planLabel: string }> = ({ panes, catalogLabel, planLabel }) => {
  const t = useT();
  const item = (on: boolean, icon: string, label: string, toggle: () => void, last: boolean) => (
    <button
      type="button"
      className={`pane-toggle ${on ? "is-on" : "is-off"}`}
      aria-pressed={on}
      onClick={toggle}
      title={on && last ? t("tools.paneLast") : t("tools.paneHint")}
    >
      <span className="pane-toggle-icon" aria-hidden>{icon}</span>
      <span className="pane-toggle-label">{label}</span>
      <span className="pane-toggle-state">{on ? `▣ ${t("tools.paneOn")}` : `▢ ${t("tools.paneOff")}`}</span>
    </button>
  );
  return (
    <div data-guide="tool-panes" className="pane-toggles" role="group" aria-label={t("tools.paneHint")}>
      {item(panes.catalog, "🗂", catalogLabel, panes.toggleCatalog, !panes.plan)}
      {item(panes.plan, "📋", planLabel, panes.togglePlan, !panes.catalog)}
    </div>
  );
};
