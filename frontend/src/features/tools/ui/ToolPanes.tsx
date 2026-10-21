"use client";

import * as React from "react";
import { PaneToggles as SharedPaneToggles, usePanes as useSharedPanes, type MessageKey, type Panes as SharedPanes } from "@/shared";

/** Окна калькулятора: каталог (первое) и итоги (второе). "" — открыты оба. */
export interface Panes {
  catalog: boolean;
  plan: boolean;
  wide: "" | "catalog" | "plan";
  raw: SharedPanes;
}

export function usePanes(): Panes {
  const raw = useSharedPanes();
  return { catalog: raw.first, plan: raw.second, wide: raw.wide === "first" ? "catalog" : raw.wide === "second" ? "plan" : "", raw };
}

/** Сетка окон: data-wide включает крупный текст и иконки в оставшемся окне (globals.css). */
export const paneGridClass = (p: Panes) =>
  `tool-panes grid min-h-0 flex-1 items-start gap-4 ${p.catalog && p.plan ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" : ""}`;

/** Карточки предметов: 3 в ряд рядом с итогами, больше — когда каталог один. */
export const paneCardsClass = (p: Panes) => `mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 ${p.wide === "catalog" ? "lg:grid-cols-4 2xl:grid-cols-5" : ""}`;

export const PaneToggles: React.FC<{ panes: Panes; catalogLabel: string; planLabel: string }> = ({ panes, catalogLabel, planLabel }) => (
  <SharedPaneToggles panes={panes.raw} first={{ label: catalogLabel, icon: "🗂" }} second={{ label: planLabel, icon: "📋" }} guide="tool-panes" />
);

/** Фракции — маленькие карточки над поиском. */
export const FACTION_FILTERS: { key: string; label: MessageKey }[] = [
  { key: "all", label: "codes.allFactions" },
  { key: "neutral", label: "codes.faction.neutral" },
  { key: "colonial", label: "codes.faction.colonial" },
  { key: "warden", label: "codes.faction.warden" },
];
