import { apiClient } from "@/shared";

/** Виды построек на карте «Планирования»; порядок — порядок фильтров. */
export const MAP_KINDS = ["town_hall", "relic", "storage", "seaport", "coastal_gun", "runway"] as const;
export type MapKind = (typeof MAP_KINDS)[number];
export type Team = "colonials" | "wardens" | "neutral";

export interface MapItem {
  kind: MapKind;
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
  /** Города (major) и малые отметки карты. */
  labels: { text: string; x: number; y: number; major: boolean }[];
}

export interface WorldMap {
  war_number: number | null;
  /** resistance — между войнами: War API отдаёт другую карту, построек не показываем. */
  phase: "conquest" | "resistance";
  winner: "colonials" | "wardens" | null;
  updated_at: string;
  next_update_at: string;
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

/** Иконка фильтра. */
export const FILTER_ICON: Record<MapKind, string> = {
  town_hall: iconOf({ kind: "town_hall", tier: 3 }),
  relic: iconOf({ kind: "relic", tier: 1 }),
  storage: iconOf({ kind: "storage", tier: null }),
  seaport: iconOf({ kind: "seaport", tier: null }),
  coastal_gun: iconOf({ kind: "coastal_gun", tier: null }),
  runway: iconOf({ kind: "runway", tier: 1 }),
};

/** Маркеры держат экранный размер; на общем плане чуть мельче, чтобы не слипались. */
export const markerFactor = (scale: number) => Math.min(1, Math.max(0.4, scale * 5));

/**
 * Подписи без каши: только города (Major) — с середины масштаба; малые отметки местности
 * (Minor) не показываем. Подпись, которая налезла бы на уже показанную, пропускаем.
 */
export function visibleLabels(all: MapRegion["labels"], scale: number) {
  if (scale <= 0.3) return [];
  const shown: { l: MapRegion["labels"][number]; x0: number; x1: number; y0: number; y1: number }[] = [];
  const pool = all.filter((l) => l.major);
  for (const l of pool) {
    const cx = l.x * HEX_W * scale, cy = l.y * HEX_H * scale;
    const w = l.text.length * (l.major ? 7 : 6) + 14, h = l.major ? 20 : 17;
    // крупный город подписан под точкой (над ней — значок ратуши), малая отметка — по центру
    const top = l.major ? cy + 2 : cy - h / 2;
    const box = { l, x0: cx - w / 2, x1: cx + w / 2, y0: top, y1: top + h };
    if (shown.some((b) => box.x0 < b.x1 + 4 && box.x1 + 4 > b.x0 && box.y0 < b.y1 + 2 && box.y1 + 2 > b.y0)) continue;
    shown.push(box);
  }
  return shown.map((b) => b.l);
}

/** Гексы, которые задевает прямоугольник (для снимков). */
export const regionsIn = (regions: MapRegion[], r: { x: number; y: number; w: number; h: number }) =>
  regions.filter((g) => hexLeft(g.col) < r.x + r.w && hexLeft(g.col) + HEX_W > r.x && hexTop(g.row) < r.y + r.h && hexTop(g.row) + HEX_H > r.y);
