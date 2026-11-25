import * as React from "react";
import { assetUrl, readStorage, writeStorage } from "@/shared";
import { HEX_H, HEX_W, type FrontlinePoint, type MapRegion } from "@/features/planning/model/map";

/* План на карте: линии, линейки, стрелки, радиусы и постройки. Координаты — «мировые»
 * пиксели карты (гекс 1024×888), размеры — в метрах игры, углы — азимут (0° — север, по часовой). */

/** Метров в пикселе карты: гекс War API — 2184 × 1890 м (README War API, World Extents). */
export const M_PER_PX_X = 2184 / HEX_W;
export const M_PER_PX_Y = 1890 / HEX_H;

export const TOOLS = ["select", "line", "freehand", "ruler", "arrow", "radius", "structure", "order", "point", "frame", "eraser"] as const;
export type Tool = (typeof TOOLS)[number];
export const UNITS = ["infantry", "tanks", "artillery", "ships"] as const;
export type Unit = (typeof UNITS)[number];
export const UNIT_COLOR: Record<Unit, string> = { infantry: "#e5484d", tanks: "#f5a524", artillery: "#a855f7", ships: "#38bdf8" };
export const FACTIONS = ["wardens", "colonials"] as const;
export type Faction = (typeof FACTIONS)[number];
/** Цвета фракций, рекомендованные README War API (Map Icon Colours, sRGB). */
export const FACTION_COLOR: Record<Faction, string> = { wardens: "#245682", colonials: "#516c4b" };
/** Точки плана — попадают в операцию вместе со снимком (цель, сбор, склад, отход). */
export const POINT_KINDS = ["target", "intel", "threat", "repair", "supply", "depot", "rally", "retreat", "other"] as const;
export type PointKind = (typeof POINT_KINDS)[number];
export const POINT_ICON: Record<PointKind, string> = { target: "🎯", intel: "👁️", threat: "⚠️", repair: "🔧", supply: "📦", depot: "🏚️", rally: "🚩", retreat: "↩️", other: "📍" };
export const POINT_COLOR: Record<PointKind, string> = { target: "#e5484d", intel: "#38bdf8", threat: "#fb7185", repair: "#facc15", supply: "#f5a524", depot: "#a3e635", rally: "#a3e635", retreat: "#38bdf8", other: "#f4f4f5" };
export const COLORS = ["#e5484d", "#f5a524", "#facc15", "#a3e635", "#38bdf8", "#a855f7", "#f4f4f5", "#18181b"] as const;
/** Generic map-distance shortcuts; item-specific weapon ranges need verified live data. */
export const RADIUS_PRESETS = [100, 250, 500, 1000, 2000] as const;

interface Base {
  id: string;
  x: number;
  y: number;
  /** Азимут, градусы 0..359. */
  angle: number;
}
export interface LineShape extends Base { kind: "line"; length: number; width: number; color: string }
export interface FreehandShape extends Base { kind: "freehand"; points: { x: number; y: number }[]; width: number; color: string }
export interface RulerShape extends Base { kind: "ruler"; length: number; color: string }
/** Маршрут из редактируемых точек; ETA — расчёт по выбранной пользователем скорости. */
export interface RouteShape extends Base { kind: "route"; points: { x: number; y: number }[]; width: number; color: string; speedKmh: number }
export interface ArrowShape extends Base { kind: "arrow"; length: number; width: number; unit: Unit; name: string; color: string }
/** Радиус: сектор шириной sweep° вокруг азимута angle (360 — полный круг). */
export interface RadiusShape extends Base { kind: "radius"; radius: number; sweep: number; color: string }
/** Постройка из меню строительства; size — масштаб значка, %. */
export interface StructureShape extends Base { kind: "structure"; ref: string; size: number; team?: Faction }
/** Метка заказа клана: report — id заказа, title — название на момент установки (если заказ удалят). */
export interface OrderShape extends Base { kind: "order"; report: string; title: string; size: number }
/** Точка плана: тип, подпись (где), подробности; size — масштаб значка, %. */
export interface PointShape extends Base { kind: "point"; point: PointKind; label: string; note: string; size: number; createdBy?: string; expiresAt?: string | null }
export type Shape = LineShape | FreehandShape | RulerShape | RouteShape | ArrowShape | RadiusShape | StructureShape | OrderShape | PointShape;

/** Настройки для новых объектов (панель инструментов). */
export interface Defaults {
  color: string;
  width: number;
  unit: Unit;
  name: string;
  sweep: number;
  radiusMeters: number;
  structure: string | null;
  team: Faction;
  order: string | null;
  point: PointKind;
  pointLabel: string;
  pointExpiryHours: number;
  speedKmh: number;
}
export const DEFAULTS: Defaults = { color: "#f5a524", width: 4, unit: "infantry", name: "", sweep: 360, radiusMeters: 500, structure: null, team: "wardens", order: null, point: "target", pointLabel: "", pointExpiryHours: 0, speedKmh: 30 };

const planKey = (scope: string) => `sindaris-planning-plan:${encodeURIComponent(scope)}`;
const DEFAULTS_KEY = "sindaris-planning-defaults";

export const loadPlan = (scope = "guest") => readStorage<Shape[]>(planKey(scope), []);
export const savePlan = (shapes: Shape[], scope = "guest") => writeStorage(planKey(scope), shapes);
export const loadDefaults = (): Defaults => ({ ...DEFAULTS, ...readStorage<Partial<Defaults>>(DEFAULTS_KEY, {}) });
export const saveDefaults = (d: Defaults) => writeStorage(DEFAULTS_KEY, d);

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Validate and normalize an exported plan before merging it into a local or clan plan. */
export function parsePlanFile(content: string): Shape[] {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid file");
  const file = value as Record<string, unknown>;
  if (file.format !== "sandalis-plan" || file.version !== 1 || !Array.isArray(file.shapes) || file.shapes.length > 2000) throw new Error("unsupported plan file");
  const number = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
  const color = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
  const point = (v: unknown): v is { x: number; y: number } => Boolean(v && typeof v === "object" && !Array.isArray(v) && number((v as { x?: unknown }).x, -100000, 100000) && number((v as { y?: unknown }).y, -100000, 100000));
  const invalid = (): never => { throw new Error("invalid shape"); };
  return file.shapes.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return invalid();
    const s = entry as Record<string, unknown>;
    const { kind, x, y, angle } = s;
    if (!number(x, -100000, 100000) || !number(y, -100000, 100000) || !number(angle, 0, 359)) return invalid();
    const base = { id: newId(), x, y, angle };
    if (kind === "line") return number(s.length, 1, 5000) && number(s.width, 1, 12) && color(s.color) ? { ...base, kind, length: s.length, width: s.width, color: s.color } : invalid();
    if (kind === "ruler") return number(s.length, 1, 5000) && color(s.color) ? { ...base, kind, length: s.length, color: s.color } : invalid();
    if (kind === "route" || kind === "freehand") {
      const maxPoints = kind === "route" ? 300 : 1200;
      if (!Array.isArray(s.points) || s.points.length < 2 || s.points.length > maxPoints || !s.points.every(point) || !number(s.width, 1, 12) || !color(s.color)) return invalid();
      if (kind === "route") return number(s.speedKmh, 1, 100) ? { ...base, kind, points: s.points, width: s.width, color: s.color, speedKmh: s.speedKmh } : invalid();
      return { ...base, kind, points: s.points, width: s.width, color: s.color };
    }
    if (kind === "arrow") return number(s.length, 1, 5000) && number(s.width, 1, 12) && UNITS.includes(s.unit as Unit) && text(s.name, 40) && color(s.color) ? { ...base, kind, length: s.length, width: s.width, unit: s.unit as Unit, name: s.name, color: s.color } : invalid();
    if (kind === "radius") return number(s.radius, 1, 3000) && number(s.sweep, 10, 360) && color(s.color) ? { ...base, kind, radius: s.radius, sweep: s.sweep, color: s.color } : invalid();
    if (kind === "structure") return text(s.ref, 200) && number(s.size, 50, 300) && (s.team === undefined || s.team === null || FACTIONS.includes(s.team as Faction)) ? { ...base, kind, ref: s.ref, size: s.size, ...(s.team ? { team: s.team as Faction } : {}) } : invalid();
    if (kind === "order") return text(s.report, 200) && text(s.title, 200) && number(s.size, 50, 300) ? { ...base, kind, report: s.report, title: s.title, size: s.size } : invalid();
    if (kind === "point") {
      const validExpiry = s.expiresAt === undefined || s.expiresAt === null || (text(s.expiresAt, 40) && Number.isFinite(Date.parse(s.expiresAt)));
      const validAuthor = s.createdBy === undefined || text(s.createdBy, 120);
      return POINT_KINDS.includes(s.point as PointKind) && text(s.label, 80) && text(s.note, 300) && number(s.size, 50, 300) && validExpiry && validAuthor
        ? { ...base, kind, point: s.point as PointKind, label: s.label, note: s.note, size: s.size, ...(s.createdBy === undefined ? {} : { createdBy: s.createdBy }), ...(s.expiresAt === undefined ? {} : { expiresAt: s.expiresAt as string | null }) }
        : invalid();
    }
    return invalid();
  }) as Shape[];
}

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

/** Длина ломаного маршрута по мировым координатам. */
export const pathLength = (points: { x: number; y: number }[]) =>
  points.slice(1).reduce((sum, point, index) => sum + measure(points[index], point).meters, 0);

/** ETA в минутах по пользовательской скорости; это оценка, без дорожной обстановки игры. */
export const routeEtaMinutes = (meters: number, speedKmh: number) =>
  Math.ceil(meters / (Math.max(1, speedKmh) * 1000 / 60));

/** Сдвиг объекта (перетаскивание). */
export const moveShape = <S extends Shape>(s: S, dx: number, dy: number): S => {
  if (s.kind === "freehand" || s.kind === "route") return { ...s, x: s.x + dx, y: s.y + dy, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) } as S;
  return { ...s, x: s.x + dx, y: s.y + dy };
};

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
  frontline?: FrontlinePoint[];
  shapes: Shape[];
}

const snapshotsKey = (scope: string) => `sindaris-planning-snapshots:${encodeURIComponent(scope)}`;
export const loadSnapshots = (scope = "guest") => readStorage<Snapshot[]>(snapshotsKey(scope), []);
export const saveSnapshots = (list: Snapshot[], scope = "guest") => writeStorage(snapshotsKey(scope), list);

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
