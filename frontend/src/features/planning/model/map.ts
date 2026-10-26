import { apiClient } from "@/shared";

/** Виды построек на карте «Планирования»; порядок — порядок фильтров. */
export const MAP_KINDS = ["town_hall", "relic", "storage", "seaport", "coastal_gun", "lighthouse", "runway", "aa_gun"] as const;
export type MapKind = (typeof MAP_KINDS)[number];
export type Team = "colonials" | "wardens" | "neutral";

export interface MapItem {
  kind: Exclude<MapKind, "lighthouse" | "aa_gun">;
  tier: number | null;
  team: Team;
  /** Доли картинки гекса 0..1. */
  x: number;
  y: number;
  victory: boolean;
  scorched: boolean;
}

export interface MapRegion {
  key: string;
  slug: string;
  name: string;
  /** Колонка и полу-ряд сетки «плоских» шестиугольников. */
  col: number;
  row: number;
  items: MapItem[];
  labels: { text: string; x: number; y: number }[];
}

export interface WorldMap {
  war_number: number | null;
  updated_at: string;
  next_update_at: string;
  /** Виды, которых нет в War API (маяк, зенитка). */
  unavailable: MapKind[];
  regions: MapRegion[];
  source: string;
}

export const planningApi = {
  map: () => apiClient.get<WorldMap>("/api/v1/world/map"),
};

/** Размер картинки гекса War API (1024×888) — единица «мировых» координат карты. */
export const HEX_W = 1024;
export const HEX_H = 888;

export const hexLeft = (col: number) => col * HEX_W * 0.75;
export const hexTop = (row: number) => (row * HEX_H) / 2;

/** Официальная иконка War API для постройки (белая, фон даёт цвет фракции). */
export function iconOf(item: Pick<MapItem, "kind" | "tier">): string {
  const name = {
    town_hall: `townbasetier${item.tier ?? 1}`,
    relic: "relicbase",
    storage: "storagefacility",
    seaport: "seaport",
    coastal_gun: "coastalgun",
    runway: `aircraftrunwayt${item.tier ?? 1}`,
  }[item.kind];
  return `/api/v1/assets/maps/icons/${name}.webp`;
}

/** Иконка фильтра (у маяка и зенитки своей нет — берётся значок интерфейса). */
export const FILTER_ICON: Partial<Record<MapKind, string>> = {
  town_hall: iconOf({ kind: "town_hall", tier: 3 }),
  relic: iconOf({ kind: "relic", tier: 1 }),
  storage: iconOf({ kind: "storage", tier: null }),
  seaport: iconOf({ kind: "seaport", tier: null }),
  coastal_gun: iconOf({ kind: "coastal_gun", tier: null }),
  runway: iconOf({ kind: "runway", tier: 1 }),
};
