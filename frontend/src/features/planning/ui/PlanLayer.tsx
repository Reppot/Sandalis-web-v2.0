"use client";

import * as React from "react";
import { FACTION_COLOR, M_PER_PX_X, M_PER_PX_Y, POINT_COLOR, POINT_ICON, UNIT_COLOR, endPoint, fmtMeters, pathLength, structureIcon, type Shape, type StructureDef, type Unit } from "@/features/planning/model/plan";
import type { Report, ReportStatus } from "@/entities/report";
import { assetUrl } from "@/shared";

/**
 * План поверх карты — SVG в «мировых» пикселях. Толщина линий и подписи держат экранный
 * размер (делим на масштаб), поэтому план читается и на общем плане, и вблизи.
 */
export const PlanLayer: React.FC<{
  shapes: Shape[];
  draft: Shape | null;
  selected: string | null;
  scale: number;
  structures: Map<string, StructureDef>;
  orders: Report[];
  bounds: { minX: number; minY: number; w: number; h: number };
  labels: Labels;
}> = ({ shapes, draft, selected, scale, structures, orders, bounds, labels }) => {
  const byId = React.useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const px = 1 / scale; // один экранный пиксель в мировых единицах
  return (
    <svg
      className="planning-plan"
      style={{ left: bounds.minX, top: bounds.minY, width: bounds.w, height: bounds.h }}
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`}
      overflow="visible"
    >
      {shapes.map((s) => (
        <ShapeView key={s.id} s={s} px={px} selected={s.id === selected} structures={structures} orders={byId} labels={labels} />
      ))}
      {draft ? <ShapeView s={draft} px={px} selected={false} structures={structures} orders={byId} labels={labels} draft /> : null}
    </svg>
  );
};

const halo = { paintOrder: "stroke", stroke: "rgba(0,0,0,0.85)", strokeLinejoin: "round" } as const;

const Label: React.FC<{ x: number; y: number; px: number; children: React.ReactNode; anchor?: "start" | "middle"; color?: string; size?: number }> = ({ x, y, px, children, anchor = "middle", color = "#fff", size = 12 }) => (
  <text x={x} y={y} fontSize={size * px} fontWeight={600} fill={color} textAnchor={anchor} dominantBaseline="central" style={{ ...halo, strokeWidth: 3 * px }} pointerEvents="none">
    {children}
  </text>
);

/** Конец отрезка-объекта и его «ручка» для изменения угла и размера. */
function tip(s: Shape) {
  if (s.kind === "radius") return endPoint(s.x, s.y, s.angle, s.radius);
  if (s.kind === "structure" || s.kind === "order" || s.kind === "point" || s.kind === "freehand" || s.kind === "route") return null;
  return endPoint(s.x, s.y, s.angle, s.length);
}

type Labels = { arrow: (unit: Unit) => string; status: (status: ReportStatus | null) => string; route: (meters: number, speedKmh: number) => string };
/** Цвет метки заказа по статусу; заказа нет (удалён) — серый. */
const ORDER_COLOR: Record<ReportStatus, string> = { open: "#f5a524", in_progress: "#38bdf8", done: "#a3e635", cancelled: "#71717a" };

const ShapeView: React.FC<{ s: Shape; px: number; selected: boolean; draft?: boolean; structures: Map<string, StructureDef>; orders: Map<string, Report>; labels: Labels }> = React.memo(({ s, px, selected, draft, structures, orders, labels }) => {
  const end = tip(s);
  const hit = { stroke: "transparent", strokeWidth: 16 * px, fill: "none", pointerEvents: "stroke" } as const;
  const sel = selected ? <SelectionRing s={s} px={px} end={end} /> : null;

  if (s.kind === "freehand") {
    const points = s.points.map((p) => `${p.x},${p.y}`).join(" ");
    return (
      <g data-shape={draft ? undefined : s.id} opacity={draft ? 0.72 : 1}>
        <polyline points={points} fill="none" stroke={s.color} strokeWidth={s.width * px} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={points} stroke="transparent" strokeWidth={16 * px} fill="none" pointerEvents="stroke" />
        {sel}
      </g>
    );
  }

  if (s.kind === "route") {
    const points = s.points.map((p) => `${p.x},${p.y}`).join(" ");
    const last = s.points[s.points.length - 1];
    const summary = labels.route(pathLength(s.points), s.speedKmh);
    return (
      <g data-shape={draft ? undefined : s.id} opacity={draft ? 0.78 : 1}>
        {s.points.length > 1 ? (
          <>
            <polyline points={points} fill="none" stroke={s.color} strokeWidth={s.width * px} strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={points} fill="none" stroke="transparent" strokeWidth={16 * px} pointerEvents="stroke" />
          </>
        ) : null}
        {s.points.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r={(selected ? 6 : 4) * px} fill={index === 0 ? "#fff" : s.color} stroke="#111" strokeWidth={1.5 * px} data-route-handle={draft ? undefined : index} style={draft ? undefined : { cursor: "grab" }} />
        ))}
        {last && s.points.length > 1 ? <Label x={last.x} y={last.y - 14 * px} px={px} color={s.color}>{summary}</Label> : null}
        {selected ? s.points.map((point, index) => <circle key={`hit-${index}`} data-route-handle={index} cx={point.x} cy={point.y} r={11 * px} fill="transparent" />) : null}
        {sel}
      </g>
    );
  }

  if (s.kind === "line" && end) {
    return (
      <g data-shape={draft ? undefined : s.id} opacity={draft ? 0.7 : 1}>
        <line x1={s.x} y1={s.y} x2={end.x} y2={end.y} stroke={s.color} strokeWidth={s.width * px} strokeLinecap="round" />
        <line x1={s.x} y1={s.y} x2={end.x} y2={end.y} {...hit} />
        {sel}
      </g>
    );
  }

  if (s.kind === "ruler" && end) {
    const mx = (s.x + end.x) / 2, my = (s.y + end.y) / 2;
    const tick = (p: { x: number; y: number }) => {
      const a = ((s.angle + 90) * Math.PI) / 180;
      const dx = Math.sin(a) * 7 * px, dy = -Math.cos(a) * 7 * px;
      return <line x1={p.x - dx} y1={p.y - dy} x2={p.x + dx} y2={p.y + dy} stroke={s.color} strokeWidth={2 * px} />;
    };
    return (
      <g data-shape={draft ? undefined : s.id} opacity={draft ? 0.8 : 1}>
        <line x1={s.x} y1={s.y} x2={end.x} y2={end.y} stroke={s.color} strokeWidth={2 * px} strokeDasharray={`${8 * px} ${5 * px}`} />
        {tick({ x: s.x, y: s.y })}
        {tick(end)}
        <line x1={s.x} y1={s.y} x2={end.x} y2={end.y} {...hit} />
        <Label x={mx} y={my - 12 * px} px={px} color={s.color}>{`${fmtMeters(s.length)} · ${s.angle}°`}</Label>
        {sel}
      </g>
    );
  }

  if (s.kind === "arrow" && end) {
    const color = s.color || UNIT_COLOR[s.unit];
    const len = Math.hypot(end.x - s.x, end.y - s.y) || 1;
    const ux = (end.x - s.x) / len, uy = (end.y - s.y) / len;
    const head = (s.width * 3 + 10) * px;
    const bx = end.x - ux * head, by = end.y - uy * head;
    const nx = -uy * head * 0.6, ny = ux * head * 0.6;
    const mx = s.x + (end.x - s.x) * 0.5, my = s.y + (end.y - s.y) * 0.5;
    return (
      <g data-shape={draft ? undefined : s.id} opacity={draft ? 0.7 : 1}>
        <line x1={s.x} y1={s.y} x2={bx} y2={by} stroke={color} strokeWidth={s.width * px} strokeLinecap="round" />
        <polygon points={`${end.x},${end.y} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`} fill={color} stroke="rgba(0,0,0,0.5)" strokeWidth={px} />
        <line x1={s.x} y1={s.y} x2={end.x} y2={end.y} {...hit} />
        <UnitBadge unit={s.unit} x={mx} y={my} px={px} color={color} title={labels.arrow(s.unit)} />
        {s.name ? <Label x={mx} y={my + 19 * px} px={px} color="#fff" size={12}>{s.name}</Label> : null}
        {sel}
      </g>
    );
  }

  if (s.kind === "radius" && end) {
    const rx = s.radius / M_PER_PX_X, ry = s.radius / M_PER_PX_Y;
    const fill = { fill: s.color, fillOpacity: 0.12, stroke: s.color, strokeWidth: 2 * px };
    let shape: React.ReactNode;
    if (s.sweep >= 360) {
      shape = <ellipse cx={s.x} cy={s.y} rx={rx} ry={ry} {...fill} />;
    } else {
      const a = endPoint(s.x, s.y, s.angle - s.sweep / 2, s.radius);
      const b = endPoint(s.x, s.y, s.angle + s.sweep / 2, s.radius);
      shape = <path d={`M${s.x},${s.y} L${a.x},${a.y} A${rx},${ry} 0 ${s.sweep > 180 ? 1 : 0} 1 ${b.x},${b.y} Z`} {...fill} />;
    }
    return (
      <g data-shape={draft ? undefined : s.id} opacity={draft ? 0.8 : 1}>
        {shape}
        <line x1={s.x} y1={s.y} x2={end.x} y2={end.y} stroke={s.color} strokeWidth={1.5 * px} strokeDasharray={`${5 * px} ${4 * px}`} />
        <circle cx={s.x} cy={s.y} r={3 * px} fill={s.color} />
        {s.sweep >= 360 ? <ellipse cx={s.x} cy={s.y} rx={rx} ry={ry} {...hit} /> : <path d={`M${s.x},${s.y} L${end.x},${end.y}`} {...hit} />}
        <Label x={(s.x + end.x) / 2} y={(s.y + end.y) / 2 - 11 * px} px={px} color={s.color}>{`R ${fmtMeters(s.radius)}${s.sweep < 360 ? ` · ${s.sweep}°` : ""}`}</Label>
        {sel}
      </g>
    );
  }

  if (s.kind === "structure") {
    const def = structures.get(s.ref);
    // значок держит экранный размер: заметен на общем плане, не раздувается вблизи
    const r = Math.max(9, 15 * (s.size / 100)) * px;
    const src = def?.icon ? assetUrl(structureIcon(def.icon)) ?? "" : "";
    const team = s.team;
    return (
      <g data-shape={draft ? undefined : s.id} transform={`translate(${s.x} ${s.y})`}>
        <circle r={r} fill={team ? FACTION_COLOR[team] : "#1c1f24"} stroke={team ? "#f4f4f5" : "#f5a524"} strokeWidth={2 * px} />
        <g transform={`rotate(${s.angle})`}>
          {src ? <image href={src} x={-r * 0.78} y={-r * 0.78} width={r * 1.56} height={r * 1.56} /> : <rect x={-r * 0.45} y={-r * 0.45} width={r * 0.9} height={r * 0.9} fill="#f5a524" />}
          <path d={`M0,${-r - 5 * px} L${-4 * px},${-r + 1 * px} L${4 * px},${-r + 1 * px} Z`} fill={team ? "#f4f4f5" : "#f5a524"} />
        </g>
        <circle r={r + 4 * px} fill="transparent" pointerEvents="all" />
        {def && px < 2.2 ? <Label x={0} y={r + 10 * px} px={px} size={11}>{def.name}</Label> : null}
        {selected ? <circle r={r + 6 * px} fill="none" stroke="#fff" strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} pointerEvents="none" /> : null}
      </g>
    );
  }
  if (s.kind === "order") {
    const order = orders.get(s.report);
    const color = order ? ORDER_COLOR[order.status] : "#71717a";
    // булавка: острие в точке заказа, головка с «планшетом»; экранный размер, как у построек
    const k = Math.max(0.6, s.size / 100) * px;
    const h = 34 * k, r = 12 * k;
    return (
      <g data-shape={draft ? undefined : s.id} transform={`translate(${s.x} ${s.y})`}>
        <path d={`M0,0 L${-r * 0.75},${-h + r * 1.2} A${r},${r} 0 1 1 ${r * 0.75},${-h + r * 1.2} Z`} fill={color} stroke="#111" strokeWidth={1.5 * px} />
        <g transform={`translate(0 ${-h + r * 0.2})`} stroke="#111" strokeWidth={1.4 * px} fill="none">
          <rect x={-r * 0.45} y={-r * 0.55} width={r * 0.9} height={r * 1.1} rx={1.5 * px} fill="#fff" />
          <path d={`M${-r * 0.25},${-r * 0.15} H${r * 0.25} M${-r * 0.25},${r * 0.15} H${r * 0.2}`} />
        </g>
        <circle cx={0} cy={-h + r * 0.2} r={r + 3 * px} fill="transparent" pointerEvents="all" />
        <Label x={0} y={9 * px} px={px} size={11.5}>{order?.title ?? s.title}</Label>
        <Label x={0} y={23 * px} px={px} size={10} color={color}>{labels.status(order?.status ?? null)}</Label>
        {selected ? <circle cx={0} cy={-h + r * 0.2} r={r + 6 * px} fill="none" stroke="#fff" strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} pointerEvents="none" /> : null}
      </g>
    );
  }
  if (s.kind === "point") {
    // флажок-точка: кружок цвета типа со значком, подпись снизу; экранный размер
    const r = Math.max(9, 14 * (s.size / 100)) * px;
    const expired = Boolean(s.expiresAt && Date.parse(s.expiresAt) <= Date.now());
    const color = expired ? "#71717a" : POINT_COLOR[s.point];
    return (
      <g data-shape={draft ? undefined : s.id} transform={`translate(${s.x} ${s.y})`} opacity={expired ? 0.7 : 1}>
        <title>{[s.label, s.createdBy, s.expiresAt].filter(Boolean).join(" · ")}</title>
        <circle r={r + 3 * px} fill="rgba(0,0,0,0.55)" />
        <circle r={r} fill="#15181c" stroke={color} strokeWidth={2.5 * px} strokeDasharray={expired ? `${4 * px} ${3 * px}` : undefined} />
        <text x={0} y={0} fontSize={r * 1.15} textAnchor="middle" dominantBaseline="central" pointerEvents="none">{POINT_ICON[s.point]}</text>
        <circle r={r + 4 * px} fill="transparent" pointerEvents="all" />
        {s.label ? <Label x={0} y={r + 11 * px} px={px} size={12} color={color}>{s.label}</Label> : null}
        {selected ? <circle r={r + 7 * px} fill="none" stroke="#fff" strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} pointerEvents="none" /> : null}
      </g>
    );
  }
  return null;
});
ShapeView.displayName = "ShapeView";

/** Рамка выделения и ручка на конце: тянешь — меняются угол и длина/радиус. */
const SelectionRing: React.FC<{ s: Shape; px: number; end: { x: number; y: number } | null }> = ({ s, px, end }) => (
  <g>
    <circle cx={s.x} cy={s.y} r={6 * px} fill="#fff" stroke="#111" strokeWidth={1.5 * px} pointerEvents="none" />
    {end ? <circle data-handle="end" cx={end.x} cy={end.y} r={7 * px} fill="#a3e635" stroke="#111" strokeWidth={1.5 * px} style={{ cursor: "crosshair" }} /> : null}
  </g>
);

/** Условный знак рода войск (по мотивам тактических обозначений). */
const UnitBadge: React.FC<{ unit: Unit; x: number; y: number; px: number; color: string; title: string }> = ({ unit, x, y, px, color, title }) => {
  const w = 24 * px, h = 16 * px;
  const l = x - w / 2, t = y - h / 2;
  let glyph: React.ReactNode;
  if (unit === "infantry") glyph = <path d={`M${l},${t} L${l + w},${t + h} M${l + w},${t} L${l},${t + h}`} />;
  else if (unit === "tanks") glyph = <rect x={l + 4 * px} y={t + 4 * px} width={w - 8 * px} height={h - 8 * px} rx={4 * px} />;
  else if (unit === "artillery") glyph = <circle cx={x} cy={y} r={2.6 * px} fill="#111" />;
  else glyph = <path d={`M${x},${t + 3 * px} V${t + h - 3 * px} M${x - 5 * px},${t + h - 6 * px} Q${x},${t + h - 1 * px} ${x + 5 * px},${t + h - 6 * px} M${x - 3 * px},${t + 5 * px} H${x + 3 * px}`} />;
  return (
    <g pointerEvents="none">
      <title>{title}</title>
      <rect x={l} y={t} width={w} height={h} fill={color} stroke="#111" strokeWidth={1.5 * px} rx={2 * px} />
      <g stroke="#111" strokeWidth={1.6 * px} fill="none">{glyph}</g>
    </g>
  );
};
