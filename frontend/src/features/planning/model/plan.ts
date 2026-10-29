import * as React from "react";
import { assetUrl, readStorage, writeStorage } from "@/shared";
import { HEX_H, HEX_W, type MapRegion } from "@/features/planning/model/map";

/* План на карте: линии, линейки, стрелки, радиусы и постройки. Координаты — «мировые»
 * пиксели карты (гекс 1024×888), размеры — в метрах игры, углы — азимут (0° — север, по часовой). */

/** Метров в пикселе карты: гекс War API — 2184 × 1890 м (README War API, World Extents). */
export const M_PER_PX_X = 2184 / HEX_W;
export const M_PER_PX_Y = 1890 / HEX_H;

export const TOOLS = ["select", "line", "ruler", "arrow", "radius", "structure", "order", "point", "frame", "eraser"] as const;
export type Tool = (typeof TOOLS)[number];
export const UNITS = ["infantry", "tanks", "artillery", "ships"] as const;
export type Unit = (typeof UNITS)[number];
export const UNIT_COLOR: Record<Unit, string> = { infantry: "#e5484d", tanks: "#f5a524", artillery: "#a855f7", ships: "#38bdf8" };
export const FACTIONS = ["wardens", "colonials"] as const;
export type Faction = (typeof FACTIONS)[number];
/** Цвета фракций, рекомендованные README War API (Map Icon Colours, sRGB). */
export const FACTION_COLOR: Record<Faction, string> = { wardens: "#245682", colonials: "#516c4b" };
/** Точки плана — попадают в операцию вместе со снимком (цель, сбор, склад, отход). */
export const POINT_KINDS = ["target", "rally", "supply", "retreat", "other"] as const;
export type PointKind = (typeof POINT_KINDS)[number];
export const POINT_ICON: Record<PointKind, string> = { target: "🎯", rally: "🚩", supply: "📦", retreat: "↩️", other: "📍" };
export const POINT_COLOR: Record<PointKind, string> = { target: "#e5484d", rally: "#a3e635", supply: "#f5a524", retreat: "#38bdf8", other: "#f4f4f5" };
export const COLORS = ["#e5484d", "#f5a524", "#facc15", "#a3e635", "#38bdf8", "#a855f7", "#f4f4f5", "#18181b"] as const;

interface Base {
  id: string;
  x: number;
  y: number;
  /** Азимут, градусы 0..359. */
  angle: number;
}
export interface LineShape extends Base { kind: "line"; length: number; width: number; color: string }
export interface RulerShape extends Base { kind: "ruler"; length: number; color: string }
export interface ArrowShape extends Base { kind: "arrow"; length: number; width: number; unit: Unit; name: string; color: string }
/** Радиус: сектор шириной sweep° вокруг азимута angle (360 — полный круг). */
export interface RadiusShape extends Base { kind: "radius"; radius: number; sweep: number; color: string }
/** Постройка из меню строительства; size — масштаб значка, %. */
export interface StructureShape extends Base { kind: "structure"; ref: string; size: number; team?: Faction }
/** Метка заказа клана: report — id заказа, title — название на момент установки (если заказ удалят). */
export interface OrderShape extends Base { kind: "order"; report: string; title: string; size: number }
/** Точка плана: тип, подпись (где), подробности; size — масштаб значка, %. */
export interface PointShape extends Base { kind: "point"; point: PointKind; label: string; note: string; size: number }
export type Shape = LineShape | RulerShape | ArrowShape | RadiusShape | StructureShape | OrderShape | PointShape;

/** Настройки для новых объектов (панель инструментов). */
export interface Defaults {
  color: string;
  width: number;
  unit: Unit;
  name: string;
  sweep: number;
  structure: string | null;
  team: Faction;
  order: string | null;
  point: PointKind;
  pointLabel: string;
}
export const DEFAULTS: Defaults = { color: "#f5a524", width: 4, unit: "infantry", name: "", sweep: 360, structure: null, team: "wardens", order: null, point: "target", pointLabel: "" };

const PLAN_KEY = "sindaris-planning-plan";
const DEFAULTS_KEY = "sindaris-planning-defaults";

export const loadPlan = () => readStorage<Shape[]>(PLAN_KEY, []);
export const savePlan = (shapes: Shape[]) => writeStorage(PLAN_KEY, shapes);
export const loadDefaults = (): Defaults => ({ ...DEFAULTS, ...readStorage<Partial<Defaults>>(DEFAULTS_KEY, {}) });
export const saveDefaults = (d: Defaults) => writeStorage(DEFAULTS_KEY, d);

export const newId = () => Math.random().toString(36).slice(2, 10);

const rad = (deg: number) => (deg * Math.PI) / 180;
export const normAngle = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;

/** Конец отрезка длиной meters по азимуту angle. */
export function endPoint(x: number, y: number, angle: number, meters: number) {
  return { x: x + (Math.sin(rad(angle)) * meters) / M_PER_PX_X, y: y - (Math.cos(rad(angle)) * meters) / M_PER_PX_Y };
}

/** Азимут и длина (м) от a до b. */
export function measure(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = (b.x - a.x) * M_PER_PX_X;
  const dy = (b.y - a.y) * M_PER_PX_Y;
  return { angle: normAngle((Math.atan2(dx, -dy) * 180) / Math.PI), meters: Math.hypot(dx, dy) };
}

export const fmtMeters = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

/** Сдвиг объекта (перетаскивание). */
export const moveShape = <S extends Shape>(s: S, dx: number, dy: number): S => ({ ...s, x: s.x + dx, y: s.y + dy });

/** Каталог построек меню строительства (backend/static/maps/structures.json). */
export interface StructureDef {
  id: string;
  name: string;
  group: string;
  icon: string | null;
}
export interface StructureCatalog {
  groups: string[];
  items: StructureDef[];
}
export const structureIcon = (icon: string) => `/api/v1/assets/maps/structures/${icon}.webp`;
export const STRUCTURES_URL = "/api/v1/assets/maps/structures.json?v=2026-10-27";

/* ───────────── снимки операций ───────────── */

/** Прямоугольник в «мировых» пикселях карты. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Снимок операции: вырезанный кусок карты с планом на момент снимка. Гексы, постройки войны
 * и объекты плана копируются — снимок не меняется, даже когда план или война идут дальше.
 */
export interface Snapshot {
  id: string;
  name: string;
  rect: Rect;
  created: string;
  war: number | null;
  phase: "conquest" | "resistance";
  regions: MapRegion[];
  shapes: Shape[];
}

const SNAPSHOTS_KEY = "sindaris-planning-snapshots";
export const loadSnapshots = () => readStorage<Snapshot[]>(SNAPSHOTS_KEY, []);
export const saveSnapshots = (list: Snapshot[]) => writeStorage(SNAPSHOTS_KEY, list);

/** Рамка из двух углов, нормализованная. */
export const rectFrom = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(b.x - a.x),
  h: Math.abs(b.y - a.y),
});

/** Каталог построек меню строительства (для подписей построек в снимках). */
export function useStructureCatalog() {
  const [catalog, setCatalog] = React.useState<StructureCatalog | null>(null);
  React.useEffect(() => {
    fetch(assetUrl(STRUCTURES_URL) ?? STRUCTURES_URL).then((r) => (r.ok ? r.json() : null)).then(setCatalog).catch(() => setCatalog(null));
  }, []);
  const map = React.useMemo(() => new Map<string, StructureDef>((catalog?.items ?? []).map((i) => [i.id, i])), [catalog]);
  return { catalog, structures: map };
}
