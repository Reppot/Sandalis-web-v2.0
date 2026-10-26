"use client";

import * as React from "react";
import { HEX_H, HEX_W, hexLeft, hexTop, iconOf, type MapItem, type MapKind, type MapRegion, type WorldMap } from "@/features/planning/model/map";
import { M_PER_PX_X, UNIT_COLOR, measure, moveShape, newId, type Defaults, type Shape, type StructureDef, type Tool } from "@/features/planning/model/plan";
import { PlanLayer } from "@/features/planning/ui/PlanLayer";
import { Icon, assetUrl, cn, useT, type MessageKey } from "@/shared";

const MIN_SCALE = 0.05;
const MAX_SCALE = 3;

interface View {
  scale: number;
  x: number;
  y: number;
}
type Point = { x: number; y: number };
type Gesture =
  | { type: "pan" }
  | { type: "draw"; start: Point }
  | { type: "move"; id: string; last: Point }
  | { type: "handle"; id: string }
  | null;

export interface Editor {
  tool: Tool;
  shapes: Shape[];
  selected: string | null;
  defaults: Defaults;
  structures: Map<string, StructureDef>;
  onSelect: (id: string | null) => void;
  onAdd: (shape: Shape) => void;
  onUpdate: (shape: Shape) => void;
  onDelete: (id: string) => void;
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

/**
 * Карта: гексы War API, постройки войны, план поверх. Панорама — перетаскиванием (или средней
 * кнопкой мыши при любом инструменте), масштаб — колесом, щипком, кнопками.
 */
export const MapCanvas: React.FC<{ data: WorldMap; hidden: Set<MapKind>; editor: Editor }> = ({ data, hidden, editor }) => {
  const t = useT();
  const box = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState<View | null>(null);
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
  const viewRef = React.useRef<View | null>(null);
  viewRef.current = view;
  const ed = React.useRef(editor);
  ed.current = editor;

  const bounds = React.useMemo(() => {
    const cols = data.regions.map((r) => r.col);
    const rows = data.regions.map((r) => r.row);
    const minX = hexLeft(Math.min(...cols));
    const minY = hexTop(Math.min(...rows));
    return { minX, minY, w: hexLeft(Math.max(...cols)) + HEX_W - minX, h: hexTop(Math.max(...rows)) + HEX_H - minY };
  }, [data]);

  const fit = React.useCallback(() => {
    const el = box.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const scale = Math.min(width / bounds.w, height / bounds.h) * 0.94;
    setView({ scale, x: (width - bounds.w * scale) / 2 - bounds.minX * scale, y: (height - bounds.h * scale) / 2 - bounds.minY * scale });
  }, [bounds]);

  // вписать карту при открытии; при смене размера окна (боковая панель, поворот телефона)
  // масштаб сохраняется, а центр карты остаётся в центре
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    fit();
    let size = el.getBoundingClientRect();
    const ro = new ResizeObserver(() => {
      const next = el.getBoundingClientRect();
      const dx = (next.width - size.width) / 2, dy = (next.height - size.height) / 2;
      size = next;
      if (dx || dy) setView((v) => (v ? { ...v, x: v.x + dx, y: v.y + dy } : v));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // масштаб вокруг точки (px внутри окна карты)
  const zoomAt = React.useCallback((factor: number, px: number, py: number) => {
    setView((v) => {
      if (!v) return v;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = scale / v.scale;
      return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);
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
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      gesture.current = null;
      setDraft(null);
      return;
    }
    const { tool, selected, defaults, onSelect, onAdd, onDelete } = ed.current;
    const shapeId = target.closest<SVGElement>("[data-shape]")?.dataset.shape ?? null;
    const p = toWorld(e.clientX, e.clientY);
    if (e.button === 1 || e.button === 2) {
      gesture.current = { type: "pan" };
    } else if (tool === "eraser") {
      if (shapeId) onDelete(shapeId);
      gesture.current = shapeId ? null : { type: "pan" };
    } else if (tool === "select") {
      if (selected && target.closest("[data-handle]")) gesture.current = { type: "handle", id: selected };
      else if (shapeId) {
        onSelect(shapeId);
        gesture.current = { type: "move", id: shapeId, last: p };
      } else {
        onSelect(null);
        gesture.current = { type: "pan" };
      }
    } else if (tool === "structure") {
      if (defaults.structure) {
        const shape: Shape = { id: newId(), kind: "structure", x: p.x, y: p.y, angle: 0, size: 100, ref: defaults.structure };
        onAdd(shape);
        gesture.current = null;
      } else gesture.current = { type: "pan" };
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
      setView((v) => (v ? { ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y } : v));
    } else if (g.type === "draw") {
      setDraft(draftShape(tool, g.start, toWorld(e.clientX, e.clientY), defaults));
    } else if (g.type === "move") {
      const p = toWorld(e.clientX, e.clientY);
      const s = shapes.find((x) => x.id === g.id);
      if (s) onUpdate(moveShape(s, p.x - g.last.x, p.y - g.last.y));
      gesture.current = { ...g, last: p };
    } else if (g.type === "handle") {
      const s = shapes.find((x) => x.id === g.id);
      if (!s || s.kind === "structure") return;
      const { angle, meters } = measure(s, toWorld(e.clientX, e.clientY));
      const size = Math.max(1, Math.round(meters));
      onUpdate(s.kind === "radius" ? { ...s, angle, radius: size } : { ...s, angle, length: size });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const g = gesture.current;
    if (g?.type === "draw" && e.type === "pointerup") {
      // точка отпускания — последняя точка черновика
      const draft = draftShape(ed.current.tool, g.start, toWorld(e.clientX, e.clientY), ed.current.defaults) ?? draftRef.current;
      // короткий «клик» без протяжки объект не создаёт
      const meters = !draft ? 0 : draft.kind === "radius" ? draft.radius : "length" in draft ? draft.length : 0;
      const long = (meters / M_PER_PX_X) * (viewRef.current?.scale ?? 1) > 12;
      if (draft && long) ed.current.onAdd({ ...draft, id: newId() });
    }
    gesture.current = null;
    setDraft(null);
  };

  const scale = view?.scale ?? 0.1;
  // маркеры держат экранный размер; на общем плане чуть мельче, чтобы не слипались
  const marker = (1 / scale) * Math.min(1, Math.max(0.4, scale * 5));
  const resistance = data.phase === "resistance";
  const cursor = editor.tool === "select" ? undefined : editor.tool === "eraser" ? "cell" : "crosshair";

  return (
    <div
      ref={box}
      className={cn("planning-canvas", editor.tool !== "select" && "is-drawing")}
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={(e) => {
        if (editor.tool !== "select") return;
        const r = e.currentTarget.getBoundingClientRect();
        zoomAt(1.8, e.clientX - r.left, e.clientY - r.top);
      }}
    >
      {view ? (
        <div className="planning-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          {data.regions.map((r) => (
            <Hex key={r.key} region={r} hidden={hidden} marker={marker} scale={scale} showItems={!resistance} />
          ))}
          <PlanLayer
            shapes={editor.shapes}
            draft={draft}
            selected={editor.selected}
            scale={scale}
            structures={editor.structures}
            bounds={bounds}
            labels={{ arrow: (u) => t(`planning.unit.${u}` as MessageKey) }}
          />
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

const Hex: React.FC<{ region: MapRegion; hidden: Set<MapKind>; marker: number; scale: number; showItems: boolean }> = React.memo(({ region, hidden, marker, scale, showItems }) => {
  const t = useT();
  const items = showItems ? region.items.filter((it) => !hidden.has(it.kind)) : [];
  // крупные города — с середины масштаба, малые отметки — только вблизи
  const labels = region.labels.filter((l) => (l.major ? scale > 0.3 : scale > 0.9));
  return (
    <div className="planning-hex" style={{ left: hexLeft(region.col), top: hexTop(region.row), width: HEX_W, height: HEX_H }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- карта региона War API, WebP */}
      <img src={assetUrl(`/api/v1/assets/maps/hex/${region.slug}.webp`) ?? ""} alt={region.name} width={HEX_W} height={HEX_H} draggable={false} />
      {scale > 0.3
        ? labels.map((l) => (
            <span key={l.text} className={cn("planning-town", !l.major && "is-minor")} style={{ left: l.x * HEX_W, top: l.y * HEX_H, transform: `translate(-50%, -50%) scale(${marker})` }}>{l.text}</span>
          ))
        : <span className="planning-region" style={{ left: HEX_W / 2, top: HEX_H / 2, transform: `translate(-50%, -50%) scale(${marker * 1.6})` }}>{region.name}</span>}
      {items.map((it, i) => (
        <Marker key={i} item={it} region={region.name} scale={marker} t={t} />
      ))}
    </div>
  );
});
Hex.displayName = "Hex";

const Marker: React.FC<{ item: MapItem; region: string; scale: number; t: ReturnType<typeof useT> }> = ({ item, region, scale, t }) => {
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
      style={{ left: item.x * HEX_W, top: item.y * HEX_H, transform: `translate(-50%, -50%) scale(${scale})` }}
      title={title}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- иконка War API 48×48 */}
      <img src={assetUrl(iconOf(item)) ?? ""} alt="" width={20} height={20} draggable={false} />
    </span>
  );
};
