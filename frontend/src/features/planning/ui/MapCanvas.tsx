"use client";

import * as React from "react";
import { HEX_H, HEX_W, hexLeft, hexTop, iconOf, markerFactor, visibleLabels, type FrontlinePoint, type MapItem, type MapKind, type MapRegion, type WorldMap } from "@/features/planning/model/map";
import { M_PER_PX_X, UNIT_COLOR, fmtMeters, measure, moveShape, newId, rectFrom, routeEtaMinutes, type Defaults, type Rect, type Shape, type StructureDef, type Tool } from "@/features/planning/model/plan";
import { PlanLayer } from "@/features/planning/ui/PlanLayer";
import { REPORT_STATUS_LABEL, type Report } from "@/entities/report";
import { Icon, assetUrl, cn, useT, type MessageKey } from "@/shared";

const MIN_SCALE = 0.05;
const MAX_SCALE = 3;
/** Пауза после жеста, после которой React перерисовывает подписи и толщину линий плана. */
const COMMIT_MS = 160;

function frontlinePath(points: FrontlinePoint[]) {
  const unique = points.filter((point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 0.5);
  if (unique.length < 2) return "";
  const [first, ...rest] = unique;
  let path = `M ${first.x} ${first.y}`;
  for (let index = 0; index < rest.length; index += 1) {
    const start = unique[index];
    const end = unique[index + 1];
    const before = unique[Math.max(0, index - 1)];
    const after = unique[Math.min(unique.length - 1, index + 2)];
    const c1x = start.x + (end.x - before.x) / 6;
    const c1y = start.y + (end.y - before.y) / 6;
    const c2x = end.x - (after.x - start.x) / 6;
    const c2y = end.y - (after.y - start.y) / 6;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${end.x} ${end.y}`;
  }
  return path;
}

interface View {
  scale: number;
  x: number;
  y: number;
}
type Point = { x: number; y: number };
type Gesture =
  | { type: "pan" }
  | { type: "draw"; start: Point }
  | { type: "freehand"; points: Point[] }
  | { type: "move"; id: string; last: Point }
  | { type: "handle"; id: string }
  | { type: "route-handle"; id: string; index: number }
  | { type: "frame"; start: Point }
  | null;

export interface Editor {
  tool: Tool;
  shapes: Shape[];
  selected: string | null;
  defaults: Defaults;
  structures: Map<string, StructureDef>;
  /** Активные заказы клана — для меток заказов (пусто у гостя). */
  orders: Report[];
  onSelect: (id: string | null) => void;
  onAdd: (shape: Shape) => void;
  onUpdate: (shape: Shape) => void;
  onDelete: (id: string) => void;
  /** Рамка «снимка операции» нарисована. */
  onFrame?: (rect: Rect) => void;
}

/** Черновик объекта, который тянут мышью от start до p. */
function draftShape(tool: Tool, start: Point, p: Point, d: Defaults): Shape | null {
  const { angle, meters } = measure(start, p);
  const length = Math.max(1, Math.round(meters));
  const base = { id: "draft", x: start.x, y: start.y, angle };
  if (tool === "line") return { ...base, kind: "line", length, width: d.width, color: d.color };
  if (tool === "ruler") return { ...base, kind: "ruler", length, color: d.color };
  if (tool === "arrow") return { ...base, kind: "arrow", length, width: d.width, unit: d.unit, name: d.name, color: UNIT_COLOR[d.unit] };
  if (tool === "radius") return { ...base, kind: "radius", radius: length, sweep: d.sweep, color: d.color };
  return null;
}

const freehandShape = (points: Point[], d: Defaults, id = "draft"): Shape => ({
  id, kind: "freehand", x: points[0].x, y: points[0].y, angle: 0,
  points, width: d.width, color: d.color,
});

/** Трансформ мира и CSS-переменные размера маркеров (--m) и подписей (--inv). */
function worldStyle(v: View): React.CSSProperties {
  const screenHexWidth = HEX_W * v.scale;
  return {
    transform: `translate(${v.x}px, ${v.y}px) scale(${v.scale})`,
    ["--m" as string]: String((1 / v.scale) * markerFactor(v.scale)),
    ["--inv" as string]: String(1 / v.scale),
    // Counter-scaled region labels stay inside their hex, even at whole-map zoom.
    ["--region-label-width" as string]: `${Math.max(36, screenHexWidth - 8)}px`,
    ["--region-label-size" as string]: `${Math.max(9, Math.min(13, screenHexWidth / 6))}px`,
  };
}

/**
 * Карта: гексы War API, постройки войны, план поверх. Панорама — перетаскиванием (или средней
 * кнопкой мыши при любом инструменте), масштаб — колесом, щипком, кнопками.
 *
 * Производительность: во время жеста React не перерисовывает карту и меняется только трансформ
 * слоя мира. Через COMMIT_MS после жеста вид фиксируется: CSS-переменные возвращают маркерам и
 * подписям экранный размер, обновляются видимость подписей и толщина линий плана.
 */
export const MapCanvas: React.FC<{
  data: WorldMap;
  hidden: Set<MapKind>;
  editor: Editor;
  selectedRegions: Set<string>;
  onToggleRegion: (key: string) => void;
  selectingRegions: boolean;
  focusRegion?: { key: string; request: number } | null;
  frontlinePoints?: FrontlinePoint[] | null;
  /** Просмотр снимка: только этот кусок карты, без правки — панорама, масштаб и подсказки. */
  frame?: Rect | null;
}> = ({ data, hidden, editor, selectedRegions, onToggleRegion, selectingRegions, focusRegion, frontlinePoints, frame }) => {
  const t = useT();
  const frontlineClipId = React.useId().replace(/:/g, "");
  const box = React.useRef<HTMLDivElement>(null);
  const world = React.useRef<HTMLDivElement>(null);
  // view — «зафиксированный» вид для React; viewRef — живой вид во время жеста
  const [view, setViewState] = React.useState<View | null>(null);
  const viewRef = React.useRef<View | null>(null);
  const focusedRequest = React.useRef<number | null>(null);
  const commitTimer = React.useRef<number | undefined>(undefined);
  const setView = React.useCallback((next: View | null | ((v: View | null) => View | null), live = false) => {
    const v = typeof next === "function" ? next(viewRef.current) : next;
    viewRef.current = v;
    const el = world.current;
    if (v && el) {
      // во время жеста — только трансформ (≈0,1 мс): смена --m / --inv пересчитывает стили
      // всех ~1500 узлов мира (≈17 мс), поэтому размер маркеров догоняет при фиксации вида
      el.style.transform = worldStyle(v).transform as string;
    }
    window.clearTimeout(commitTimer.current);
    if (live) commitTimer.current = window.setTimeout(() => setViewState(viewRef.current), COMMIT_MS);
    else setViewState(v);
  }, []);
  React.useEffect(() => () => window.clearTimeout(commitTimer.current), []);
  const [draft, setDraftState] = React.useState<Shape | null>(null);
  // черновик ещё и в ref: быстрый «рывок» мышью отпускает кнопку раньше перерисовки
  const draftRef = React.useRef<Shape | null>(null);
  const setDraft = (d: Shape | null) => {
    draftRef.current = d;
    setDraftState(d);
  };
  const pointers = React.useRef(new Map<number, Point>());
  const pinch = React.useRef<number | null>(null);
  const gesture = React.useRef<Gesture>(null);
  const [frameDraft, setFrameDraft] = React.useState<Rect | null>(null);
  const readOnly = Boolean(frame);
  const ed = React.useRef(editor);
  ed.current = editor;

  // В режиме выбора карта остаётся обзором. После подтверждения показываем только выбранные
  // регионы и считаем границы по ним, чтобы кадр не оставался масштабированным под всю войну.
  const visibleRegions = React.useMemo(() => {
    if (selectingRegions || selectedRegions.size === 0) return data.regions;
    const selected = data.regions.filter((region) => selectedRegions.has(region.key));
    return selected.length > 0 ? selected : data.regions;
  }, [data.regions, selectingRegions, selectedRegions]);

  const mapBounds = React.useMemo(() => {
    const cols = data.regions.map((r) => r.col);
    const rows = data.regions.map((r) => r.row);
    const minX = hexLeft(Math.min(...cols));
    const minY = hexTop(Math.min(...rows));
    return { minX, minY, w: hexLeft(Math.max(...cols)) + HEX_W - minX, h: hexTop(Math.max(...rows)) + HEX_H - minY };
  }, [data.regions]);

  const bounds = React.useMemo(() => {
    const cols = visibleRegions.map((r) => r.col);
    const rows = visibleRegions.map((r) => r.row);
    const minX = hexLeft(Math.min(...cols));
    const minY = hexTop(Math.min(...rows));
    return { minX, minY, w: hexLeft(Math.max(...cols)) + HEX_W - minX, h: hexTop(Math.max(...rows)) + HEX_H - minY };
  }, [visibleRegions]);

  // во что вписываем: весь театр войны или кадр снимка
  const target = React.useMemo(() => (frame ? { minX: frame.x, minY: frame.y, w: frame.w, h: frame.h } : bounds), [frame, bounds]);
  const fit = React.useCallback(() => {
    const el = box.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const canvasLeft = el.getBoundingClientRect().left;
    const filters = el.closest(".planning-map")?.querySelector(".planning-filters");
    const filtersRight = filters?.getBoundingClientRect().right ?? canvasLeft;
    const insetLeft = !frame && !selectingRegions && selectedRegions.size > 0
      ? Math.min(width * 0.55, Math.max(0, filtersRight - canvasLeft))
      : 0;
    const availableWidth = Math.max(1, width - insetLeft);
    const scale = Math.min(availableWidth / target.w, height / target.h) * (frame ? 0.98 : 0.94);
    setView({ scale, x: insetLeft + (availableWidth - target.w * scale) / 2 - target.minX * scale, y: (height - target.h * scale) / 2 - target.minY * scale });
  }, [target, frame, selectingRegions, selectedRegions, setView]);

  // вписать карту при открытии; при смене размера окна (боковая панель, поворот телефона)
  // масштаб сохраняется, а центр карты остаётся в центре
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    fit();
    let size = el.getBoundingClientRect();
    const ro = new ResizeObserver(() => {
      const next = el.getBoundingClientRect();
      const oldAspect = size.width / size.height;
      const nextAspect = next.width / next.height;
      // A desktop-to-phone change is not a sidebar resize: keep the whole theater
      // visible instead of carrying a desktop zoom level into the narrow viewport.
      if (Math.abs(nextAspect / oldAspect - 1) > 0.35) {
        size = next;
        fit();
        return;
      }
      const dx = (next.width - size.width) / 2, dy = (next.height - size.height) / 2;
      size = next;
      if (dx || dy) setView((v) => (v ? { ...v, x: v.x + dx, y: v.y + dy } : v));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, setView]);

  React.useEffect(() => {
    if (!focusRegion || focusedRequest.current === focusRegion.request) return;
    const region = data.regions.find((item) => item.key === focusRegion.key);
    const el = box.current;
    const current = viewRef.current;
    if (!region || !el || !current) return;
    const bounds = el.getBoundingClientRect();
    const scale = Math.max(current.scale, 0.42);
    const centerX = hexLeft(region.col) + HEX_W / 2;
    const centerY = hexTop(region.row) + HEX_H / 2;
    setView({ scale, x: bounds.width / 2 - centerX * scale, y: bounds.height / 2 - centerY * scale }, true);
    focusedRequest.current = focusRegion.request;
  }, [data.regions, focusRegion, setView]);

  // масштаб вокруг точки (px внутри окна карты)
  const zoomAt = React.useCallback((factor: number, px: number, py: number) => {
    setView((v) => {
      if (!v) return v;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = scale / v.scale;
      return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    }, true);
  }, [setView]);
  const zoomCenter = (factor: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r) zoomAt(factor, r.width / 2, r.height / 2);
  };

  // колесо — не пассивный слушатель, иначе страница прокручивается вместе с картой
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const toWorld = (clientX: number, clientY: number): Point => {
    const r = box.current!.getBoundingClientRect();
    const v = viewRef.current!;
    return { x: (clientX - r.left - v.x) / v.scale, y: (clientY - r.top - v.y) / v.scale };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as Element;
    if (target.closest("button, input, select, textarea, a") || !viewRef.current) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // указатель уже отпущен (синтетическое событие) — рисуем без захвата
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      gesture.current = null;
      setDraft(null);
      return;
    }
    const { tool, selected, defaults, onSelect, onAdd, onDelete } = ed.current;
    const shapeId = target.closest<SVGElement>("[data-shape]")?.dataset.shape ?? null;
    const p = toWorld(e.clientX, e.clientY);
    if (selectingRegions) {
      const regionKey = target.closest<HTMLElement>("[data-region]")?.dataset.region;
      if (regionKey) onToggleRegion(regionKey);
      gesture.current = { type: "pan" };
      return;
    }
    if (!isInSelectedRegion(p)) {
      gesture.current = { type: "pan" };
      return;
    }
    if (readOnly || e.button === 1 || e.button === 2) {
      gesture.current = { type: "pan" };
    } else if (tool === "frame") {
      gesture.current = { type: "frame", start: p };
    } else if (tool === "eraser") {
      if (shapeId) onDelete(shapeId);
      gesture.current = shapeId ? null : { type: "pan" };
    } else if (tool === "select") {
      const routeHandle = target.closest<SVGElement>("[data-route-handle]");
      if (routeHandle && shapeId && Number.isInteger(Number(routeHandle.dataset.routeHandle))) {
        onSelect(shapeId);
        gesture.current = { type: "route-handle", id: shapeId, index: Number(routeHandle.dataset.routeHandle) };
      }
      else if (selected && target.closest("[data-handle]")) gesture.current = { type: "handle", id: selected };
      else if (shapeId) {
        onSelect(shapeId);
        gesture.current = { type: "move", id: shapeId, last: p };
      } else {
        onSelect(null);
        gesture.current = { type: "pan" };
      }
    } else if (tool === "structure") {
      if (defaults.structure) {
        const shape: Shape = { id: newId(), kind: "structure", x: p.x, y: p.y, angle: 0, size: 100, ref: defaults.structure, team: defaults.team };
        onAdd(shape);
        gesture.current = null;
      } else gesture.current = { type: "pan" };
    } else if (tool === "order") {
      const report = defaults.order ? ed.current.orders.find((o) => o.id === defaults.order) : null;
      if (report) {
        onAdd({ id: newId(), kind: "order", x: p.x, y: p.y, angle: 0, size: 100, report: report.id, title: report.title });
        gesture.current = null;
      } else gesture.current = { type: "pan" };
    } else if (tool === "point") {
      onAdd({ id: newId(), kind: "point", x: p.x, y: p.y, angle: 0, size: 100, point: defaults.point, label: defaults.pointLabel.trim(), note: "" });
      gesture.current = null;
    } else if (tool === "freehand") {
      gesture.current = { type: "freehand", points: [p] };
      setDraft(freehandShape([p], defaults));
    } else {
      gesture.current = { type: "draw", start: p };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const pts = pointers.current;
    if (pts.size === 2) {
      // щипок двумя пальцами
      const [a, b] = [...pts.entries()].map(([id, p]) => (id === e.pointerId ? { x: e.clientX, y: e.clientY } : p));
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current) {
        const r = box.current!.getBoundingClientRect();
        zoomAt(dist / pinch.current, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
      pinch.current = dist;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const { shapes, onUpdate, tool, defaults } = ed.current;
    if (g.type === "pan") {
      setView((v) => (v ? { ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y } : v), true);
    } else if (g.type === "draw") {
      setDraft(draftShape(tool, g.start, toWorld(e.clientX, e.clientY), defaults));
    } else if (g.type === "freehand") {
      const p = toWorld(e.clientX, e.clientY);
      const last = g.points[g.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) >= 5 && g.points.length < 1200) {
        const points = [...g.points, p];
        gesture.current = { ...g, points };
        setDraft(freehandShape(points, defaults));
      }
    } else if (g.type === "frame") {
      setFrameDraft(rectFrom(g.start, toWorld(e.clientX, e.clientY)));
    } else if (g.type === "move") {
      const p = toWorld(e.clientX, e.clientY);
      const s = shapes.find((x) => x.id === g.id);
      if (s) onUpdate(moveShape(s, p.x - g.last.x, p.y - g.last.y));
      gesture.current = { ...g, last: p };
    } else if (g.type === "handle") {
      const s = shapes.find((x) => x.id === g.id);
      if (!s || s.kind === "structure" || s.kind === "order" || s.kind === "point" || s.kind === "freehand" || s.kind === "route") return;
      const { angle, meters } = measure(s, toWorld(e.clientX, e.clientY));
      const size = Math.max(1, Math.round(meters));
      onUpdate(s.kind === "radius" ? { ...s, angle, radius: size } : { ...s, angle, length: size });
    } else if (g.type === "route-handle") {
      const s = shapes.find((x) => x.id === g.id);
      if (s?.kind === "route") {
        const points = s.points.map((point, index) => index === g.index ? toWorld(e.clientX, e.clientY) : point);
        onUpdate({ ...s, x: points[0]?.x ?? s.x, y: points[0]?.y ?? s.y, points });
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const g = gesture.current;
    if (g?.type === "freehand" && e.type === "pointerup") {
      const end = toWorld(e.clientX, e.clientY);
      const points = [...g.points, end];
      const length = points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point.x - points[i].x, point.y - points[i].y), 0);
      if (length * (viewRef.current?.scale ?? 1) > 12 && points.length > 2) ed.current.onAdd(freehandShape(points, ed.current.defaults, newId()));
    }
    if (g?.type === "draw" && e.type === "pointerup") {
      // точка отпускания — последняя точка черновика
      const draft = draftShape(ed.current.tool, g.start, toWorld(e.clientX, e.clientY), ed.current.defaults) ?? draftRef.current;
      // короткий «клик» без протяжки объект не создаёт
      const meters = !draft ? 0 : draft.kind === "radius" ? draft.radius : "length" in draft ? draft.length : 0;
      const long = (meters / M_PER_PX_X) * (viewRef.current?.scale ?? 1) > 12;
      if (draft && long) ed.current.onAdd({ ...draft, id: newId() });
      else if (ed.current.tool === "radius") ed.current.onAdd({
        id: newId(), kind: "radius", x: g.start.x, y: g.start.y, angle: 0,
        radius: ed.current.defaults.radiusMeters, sweep: ed.current.defaults.sweep, color: ed.current.defaults.color,
      });
    }
    if (g?.type === "frame" && e.type === "pointerup") {
      const rect = rectFrom(g.start, toWorld(e.clientX, e.clientY));
      const s = viewRef.current?.scale ?? 1;
      // кадр меньше 40×40 экранных пикселей — случайный клик
      if (rect.w * s > 40 && rect.h * s > 40) ed.current.onFrame?.(rect);
    }
    gesture.current = null;
    setDraft(null);
    setFrameDraft(null);
  };

  const scale = view?.scale ?? 0.1;
  const live = viewRef.current ?? view;
  const resistance = data.phase === "resistance";
  const isInSelectedRegion = React.useCallback((p: Point) => data.regions.some((region) => {
    if (!selectedRegions.has(region.key)) return false;
    const x = (p.x - hexLeft(region.col)) / HEX_W;
    const y = (p.y - hexTop(region.row)) / HEX_H;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 && Math.abs(x - 0.5) + Math.abs(y - 0.5) / 2 <= 0.5;
  }), [data.regions, selectedRegions]);
  const planLabels = React.useMemo(
    () => ({
      arrow: (u: string) => t(`planning.unit.${u}` as MessageKey),
      status: (st: Report["status"] | null) => (st ? t(REPORT_STATUS_LABEL[st]) : t("planning.orderGone")),
      route: (meters: number, speedKmh: number) => {
        const minutes = routeEtaMinutes(meters, speedKmh);
        const eta = minutes >= 60
          ? t("planning.routeHoursMinutes", { h: Math.floor(minutes / 60), m: minutes % 60 })
          : t("planning.routeMinutes", { m: minutes });
        return t("planning.routeSummary", { distance: fmtMeters(meters), eta, speed: speedKmh });
      },
    }),
    [t],
  );
  const cursor = readOnly || editor.tool === "select" ? undefined : editor.tool === "eraser" ? "cell" : "crosshair";

  return (
    <div
      ref={box}
      className={cn("planning-canvas", !readOnly && editor.tool !== "select" && "is-drawing")}
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={(e) => {
        if (!readOnly && editor.tool !== "select") return;
        const r = e.currentTarget.getBoundingClientRect();
        zoomAt(1.8, e.clientX - r.left, e.clientY - r.top);
      }}
    >
      {view ? (
        <div ref={world} className="planning-world" style={{ ...(live ? worldStyle(live) : {}), width: Math.max(0, mapBounds.minX + mapBounds.w), height: Math.max(0, mapBounds.minY + mapBounds.h) }}>
          {visibleRegions.map((r) => (
            <Hex key={r.key} region={r} hidden={hidden} scale={scale} showItems={!resistance && selectedRegions.has(r.key)} selected={selectedRegions.has(r.key)} selecting={selectingRegions} onToggleRegion={onToggleRegion} />
          ))}
          {!resistance && frontlinePoints && frontlinePoints.length > 1 ? <svg className="planning-frontline" style={{ left: mapBounds.minX, top: mapBounds.minY, width: mapBounds.w, height: mapBounds.h }} viewBox={`${mapBounds.minX} ${mapBounds.minY} ${mapBounds.w} ${mapBounds.h}`} aria-label={t("planning.frontline")}>
            <defs>
              <clipPath id={frontlineClipId} clipPathUnits="userSpaceOnUse">
                {visibleRegions.map((region) => {
                  const x = hexLeft(region.col);
                  const y = hexTop(region.row);
                  const points = [
                    [x + HEX_W * 0.25, y],
                    [x + HEX_W * 0.75, y],
                    [x + HEX_W, y + HEX_H * 0.5],
                    [x + HEX_W * 0.75, y + HEX_H],
                    [x + HEX_W * 0.25, y + HEX_H],
                    [x, y + HEX_H * 0.5],
                  ].map(([px, py]) => `${px},${py}`).join(" ");
                  return <polygon key={region.key} data-frontline-clip-hex={region.key} points={points} />;
                })}
              </clipPath>
            </defs>
            <g clipPath={`url(#${frontlineClipId})`}>
              <path d={frontlinePath(frontlinePoints)} fill="none" stroke="#111" strokeWidth={12} strokeLinejoin="round" strokeLinecap="round" />
              <path d={frontlinePath(frontlinePoints)} fill="none" stroke="#f34f55" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          </svg> : null}
          <PlanLayer
            shapes={editor.shapes.filter((shape) => isInSelectedRegion(shape))}
            draft={draft}
            selected={editor.selected}
            scale={scale}
            structures={editor.structures}
            orders={editor.orders}
            bounds={bounds}
            labels={planLabels}
          />
          {frameDraft ? <div className="planning-frame is-draft" style={{ left: frameDraft.x, top: frameDraft.y, width: frameDraft.w, height: frameDraft.h, borderWidth: 2 / scale }} /> : null}
          {frame ? <FrameMask frame={frame} scale={scale} /> : null}
        </div>
      ) : null}
      <div className="planning-zoom">
        <button type="button" className="icon-btn" onClick={() => zoomCenter(1.5)} aria-label={t("planning.zoomIn")} title={t("planning.zoomIn")}><Icon name="plus" size={16} /></button>
        <button type="button" className="icon-btn" onClick={() => zoomCenter(1 / 1.5)} aria-label={t("planning.zoomOut")} title={t("planning.zoomOut")}><Icon name="minus" size={16} /></button>
        <button type="button" className="icon-btn" onClick={fit} aria-label={t("planning.fit")} title={t("planning.fit")}><Icon name="map" size={16} /></button>
      </div>
    </div>
  );
};

const Hex: React.FC<{ region: MapRegion; hidden: Set<MapKind>; scale: number; showItems: boolean; selected: boolean; selecting: boolean; onToggleRegion: (key: string) => void }> = React.memo(({ region, hidden, scale, showItems, selected, selecting, onToggleRegion }) => {
  const t = useT();
  const items = showItems ? region.items.filter((it) => !hidden.has(it.kind)) : [];
  const labels = React.useMemo(() => visibleLabels(region.labels, scale), [region.labels, scale]);
  return (
    <div
      data-region={region.key}
      className={cn("planning-hex", selected && "is-region-selected", selecting && !selected && "is-unselected", selecting && "is-selecting")}
      style={{ left: hexLeft(region.col), top: hexTop(region.row), width: HEX_W, height: HEX_H }}
      role={selecting ? "button" : undefined}
      tabIndex={selecting ? 0 : -1}
      aria-label={selecting ? region.name : undefined}
      aria-pressed={selecting ? selected : undefined}
      onKeyDown={(event) => {
        if (!selecting || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        onToggleRegion(region.key);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- карта региона War API, WebP */}
      {/* на общем плане — копия 256 px (в памяти видеокарты в 16 раз меньше), ближе — полная */}
      <img src={assetUrl(`/api/v1/assets/maps/hex/${selected ? "" : "sm/"}${region.slug}.webp`) ?? ""} alt={region.name} width={HEX_W} height={HEX_H} draggable={false} decoding="async" />
      {selecting ? <span className="planning-hex-select-label">{region.name}</span> : null}
      {scale > 0.3
        ? labels.map((l) => (
            <span key={l.text} className={cn("planning-town", !l.major && "is-minor")} style={{ left: l.x * HEX_W, top: l.y * HEX_H, transform: `scale(var(--inv)) translate(-50%, ${l.major ? "3px" : "-50%"})` }}>{l.text}</span>
          ))
        : <span className="planning-region" style={{ left: HEX_W / 2, top: HEX_H / 2 }}>{region.name}</span>}
      {items.map((it, i) => (
        <Marker key={i} item={it} region={region.name} t={t} />
      ))}
    </div>
  );
});
Hex.displayName = "Hex";

/** Маркер постройки: экранный размер — через CSS-переменную --m слоя мира (без перерисовки). */
const Marker: React.FC<{ item: MapItem; region: string; t: ReturnType<typeof useT> }> = React.memo(({ item, region, t }) => {
  const title = [
    t(`planning.kind.${item.kind}` as MessageKey) + (item.tier && item.kind !== "relic" ? ` T${item.tier}` : ""),
    item.team === "neutral" ? t("planning.neutral") : t(item.team === "wardens" ? "world.wardens" : "world.colonials"),
    item.victory ? t("planning.victory") : null,
    item.scorched ? t("planning.scorched") : null,
    region,
  ].filter(Boolean).join(" · ");
  return (
    <span
      className={cn("planning-marker", `team-${item.team}`, item.victory && "is-victory", item.scorched && "is-scorched")}
      style={{ left: item.x * HEX_W, top: item.y * HEX_H }}
      data-tooltip={title}
      role="img"
      aria-label={title}
      tabIndex={0}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- иконка War API 48×48 */}
      <img src={assetUrl(iconOf(item)) ?? ""} alt="" width={20} height={20} draggable={false} decoding="async" />
    </span>
  );
});
Marker.displayName = "Marker";

/** Всё вне кадра снимка затемнено — видно, что это вырезанный кусок карты. */
const FrameMask: React.FC<{ frame: Rect; scale: number }> = ({ frame, scale }) => {
  const far = 100000;
  const r = frame;
  return (
    <>
      <div className="planning-mask" style={{ left: r.x - far, top: r.y - far, width: far * 2 + r.w, height: far }} />
      <div className="planning-mask" style={{ left: r.x - far, top: r.y + r.h, width: far * 2 + r.w, height: far }} />
      <div className="planning-mask" style={{ left: r.x - far, top: r.y, width: far, height: r.h }} />
      <div className="planning-mask" style={{ left: r.x + r.w, top: r.y, width: far, height: r.h }} />
      <div className="planning-frame" style={{ left: r.x, top: r.y, width: r.w, height: r.h, borderWidth: 2 / scale }} />
    </>
  );
};
