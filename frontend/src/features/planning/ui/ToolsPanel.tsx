"use client";

import * as React from "react";
import { COLORS, FACTIONS, FACTION_COLOR, POINT_COLOR, POINT_ICON, POINT_KINDS, UNITS, UNIT_COLOR, normAngle, structureIcon, type Defaults, type Faction, type PointKind, type Shape, type Snapshot, type StructureCatalog, type StructureDef, type Tool, type Unit } from "@/features/planning/model/plan";
import { REPORT_STATUS_LABEL, type Report } from "@/entities/report";
import { Icon, assetUrl, cn, formatDateTime, useConfirm, useT, type IconName, type MessageKey } from "@/shared";

const TOOL_ICON: Record<Tool, IconName> = { select: "cursor", line: "line", freehand: "line", ruler: "ruler", arrow: "arrow", radius: "radius", structure: "building", order: "paste", point: "flag", frame: "crop", eraser: "eraser" };
const TOOL_GROUPS = {
  draw: ["line", "freehand", "ruler", "arrow", "radius"],
  place: ["structure", "order", "point"],
  edit: ["select", "frame", "eraser"],
} as const;
type ToolGroup = keyof typeof TOOL_GROUPS;

/**
 * Правая панель «Планирования»: инструменты, настройки новых объектов, свойства выбранного
 * объекта (угол, размер, род войск, название) и каталог построек меню строительства.
 */
export const ToolsPanel: React.FC<{
  tool: Tool;
  onTool: (tool: Tool) => void;
  defaults: Defaults;
  onDefaults: (d: Defaults) => void;
  selected: Shape | null;
  onUpdate: (s: Shape) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  count: number;
  catalog: StructureCatalog | null;
  structures: Map<string, StructureDef>;
  /** Активные заказы клана; null — ещё грузятся. */
  orders: Report[] | null;
  member: boolean;
  snapshots: Snapshot[];
  onOpenSnapshot: (s: Snapshot) => void;
  onRenameSnapshot: (id: string, name: string) => void;
  onDeleteSnapshot: (id: string) => void;
  /** «Перенести в операции» — все снимки сессии; нет — нет права создавать операции. */
  onMoveSnapshots?: () => void;
  /** План клана без права правки: инструменты скрыты. */
  locked?: boolean;
  /** Подпись «где хранится план». */
  savedLabel?: string;
}> = ({ tool, onTool, defaults, onDefaults, selected, onUpdate, onDelete, onClear, count, catalog, structures, orders, member, snapshots, onOpenSnapshot, onRenameSnapshot, onDeleteSnapshot, onMoveSnapshots, locked, savedLabel }) => {
  const t = useT();
  const [armed, confirm] = useConfirm();
  const [toolGroup, setToolGroup] = React.useState<ToolGroup>("edit");
  const set = <K extends keyof Defaults>(key: K, value: Defaults[K]) => onDefaults({ ...defaults, [key]: value });
  const pickTool = (next: Tool) => {
    const group = (Object.keys(TOOL_GROUPS) as ToolGroup[]).find((key) => (TOOL_GROUPS[key] as readonly Tool[]).includes(next));
    if (group) setToolGroup(group);
    onTool(next);
  };
  const drawing = tool === "line" || tool === "freehand" || tool === "arrow" || tool === "radius" || tool === "ruler";

  if (locked) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg-2">{t("planning.clanLocked")}</p>
        <div className="mt-auto border-t border-[var(--border)] pt-3 text-xs text-fg-3">{t("planning.objects", { n: count })} · {savedLabel}</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="planning-tool-groups">
        <div data-guide="planning-tool-tabs" className="planning-tool-tabs" role="tablist" aria-label={t("planning.tools")}>
          {(Object.keys(TOOL_GROUPS) as ToolGroup[]).map((group) => (
            <button key={group} type="button" role="tab" aria-selected={toolGroup === group} className={cn("planning-tool-tab", toolGroup === group && "is-active")} onClick={() => setToolGroup(group)}>
              {t(`planning.toolGroup.${group}` as MessageKey)}
            </button>
          ))}
        </div>
        <div data-guide="planning-tool-list" className="planning-tools" role="toolbar" aria-label={t("planning.toolGroup." + toolGroup as MessageKey)}>
        {TOOL_GROUPS[toolGroup].map((id) => (
          <button key={id} data-guide={`planning-tool-${id}`} type="button" className={cn("planning-tool", tool === id && "is-active")} onClick={() => pickTool(id)} aria-pressed={tool === id} title={t(`planning.tool.${id}Hint` as MessageKey)}>
            <Icon name={TOOL_ICON[id]} size={18} />
            <span>{t(`planning.tool.${id}` as MessageKey)}</span>
          </button>
        ))}
        </div>
      </div>
      <p className="text-xs text-fg-3">{t(`planning.tool.${tool}Hint` as MessageKey)}</p>

      {selected ? (
        <Properties shape={selected} onUpdate={onUpdate} onDelete={onDelete} structures={structures} orders={orders ?? []} />
      ) : drawing ? (
        <section className="planning-props">
          <h3 className="planning-props-title">{t("planning.newObject")}</h3>
          {tool === "arrow" ? (
            <>
              <UnitPicker value={defaults.unit} onChange={(u) => set("unit", u)} />
              <Field label={t("planning.prop.name")}>
                <input className="field h-9" value={defaults.name} maxLength={40} placeholder={t("planning.prop.namePlaceholder")} onChange={(e) => set("name", e.target.value)} />
              </Field>
            </>
          ) : (
            <ColorPicker value={defaults.color} onChange={(c) => set("color", c)} />
          )}
          {tool === "line" || tool === "freehand" || tool === "arrow" ? <Range label={t("planning.prop.width")} value={defaults.width} min={1} max={12} unit="px" onChange={(v) => set("width", v)} /> : null}
          {tool === "radius" ? <Range label={t("planning.prop.sweep")} value={defaults.sweep} min={10} max={360} unit="°" onChange={(v) => set("sweep", v)} /> : null}
        </section>
      ) : null}

      {tool === "structure" && !selected ? (
        <>
          <FactionPicker value={defaults.team} onChange={(team) => set("team", team)} />
          <StructurePicker catalog={catalog} value={defaults.structure} onChange={(id) => set("structure", id)} />
        </>
      ) : null}
      {tool === "point" && !selected ? (
        <section className="planning-props">
          <h3 className="planning-props-title">{t("planning.newObject")}</h3>
          <PointPicker value={defaults.point} onChange={(p) => set("point", p)} />
          <Field label={t("planning.prop.pointLabel")}>
            <input className="field h-9" value={defaults.pointLabel} maxLength={80} placeholder={t("planning.prop.pointLabelPh")} onChange={(e) => set("pointLabel", e.target.value)} />
          </Field>
        </section>
      ) : null}
      {tool === "frame" || snapshots.length ? <SnapshotList list={snapshots} onOpen={onOpenSnapshot} onRename={onRenameSnapshot} onDelete={onDeleteSnapshot} onMove={onMoveSnapshots} /> : null}
      {tool === "order" && !selected ? <OrderPicker orders={orders} member={member} value={defaults.order} onChange={(id) => set("order", id)} /> : null}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-xs text-fg-3">
        <span>{t("planning.objects", { n: count })} · {savedLabel ?? t("planning.savedLocal")}</span>
        <button type="button" className={cn("btn h-8 min-h-0 px-2.5 text-xs", armed === "clear" && "text-danger")} disabled={!count} onClick={() => confirm("clear", onClear)}>
          <Icon name="trash" size={14} />
          {armed === "clear" ? t("common.confirmQ") : t("planning.clear")}
        </button>
      </div>
    </div>
  );
};

/* ───────────── свойства выбранного объекта ───────────── */

const Properties: React.FC<{ shape: Shape; onUpdate: (s: Shape) => void; onDelete: (id: string) => void; structures: Map<string, StructureDef>; orders: Report[] }> = ({ shape, onUpdate, onDelete, structures, orders }) => {
  const t = useT();
  const s = shape;
  const order = s.kind === "order" ? orders.find((o) => o.id === s.report) : undefined;
  const title =
    s.kind === "structure" ? structures.get(s.ref)?.name ?? t("planning.tool.structure")
    : s.kind === "order" ? order?.title ?? s.title
    : s.kind === "point" ? `${POINT_ICON[s.point]} ${t(`opsPlan.point.${s.point}` as MessageKey)}`
    : t(`planning.tool.${s.kind}` as MessageKey);
  return (
    <section className="planning-props">
      <div className="flex items-center justify-between gap-2">
        <h3 className="planning-props-title">{title}</h3>
        <button type="button" className="icon-btn" onClick={() => onDelete(s.id)} aria-label={t("common.delete")} title={t("common.delete")}><Icon name="trash" size={15} /></button>
      </div>

      {s.kind === "arrow" ? (
        <>
          <UnitPicker value={s.unit} onChange={(unit) => onUpdate({ ...s, unit, color: UNIT_COLOR[unit] })} />
          <Field label={t("planning.prop.name")}>
            <input className="field h-9" value={s.name} maxLength={40} placeholder={t("planning.prop.namePlaceholder")} onChange={(e) => onUpdate({ ...s, name: e.target.value })} />
          </Field>
        </>
      ) : null}

      {s.kind === "point" ? (
        <>
          <PointPicker value={s.point} onChange={(point) => onUpdate({ ...s, point })} />
          <Field label={t("planning.prop.pointLabel")}>
            <input className="field h-9" value={s.label} maxLength={80} placeholder={t("planning.prop.pointLabelPh")} onChange={(e) => onUpdate({ ...s, label: e.target.value })} />
          </Field>
          <Field label={t("planning.prop.pointNote")}>
            <input className="field h-9" value={s.note} maxLength={300} placeholder={t("planning.prop.pointNotePh")} onChange={(e) => onUpdate({ ...s, note: e.target.value })} />
          </Field>
          <p className="text-xs text-fg-3">{t("planning.pointToOps")}</p>
        </>
      ) : s.kind === "order" ? (
        <>
          <p className="text-sm text-fg-2">{order ? `${t(REPORT_STATUS_LABEL[order.status])} · ${t("planning.orderLines", { n: order.lines_count })}` : t("planning.orderGone")}</p>
          <a className="btn h-9 min-h-0 justify-center text-sm" href="/?tab=clan&view=reports">
            <Icon name="external" size={15} />
            {t("planning.openOrders")}
          </a>
        </>
      ) : s.kind === "freehand" ? null : (
        <Range label={s.kind === "structure" ? t("planning.prop.rotation") : t("planning.prop.angle")} value={s.angle} min={0} max={359} unit="°" onChange={(v) => onUpdate({ ...s, angle: normAngle(v) })} />
      )}

      {s.kind === "line" || s.kind === "ruler" || s.kind === "arrow" ? (
        <Range label={t("planning.prop.length")} value={s.length} min={5} max={5000} step={5} unit="m" onChange={(v) => onUpdate({ ...s, length: v })} />
      ) : null}
      {s.kind === "radius" ? (
        <>
          <Range label={t("planning.prop.radius")} value={s.radius} min={5} max={3000} step={5} unit="m" onChange={(v) => onUpdate({ ...s, radius: v })} />
          <Range label={t("planning.prop.sweep")} value={s.sweep} min={10} max={360} unit="°" onChange={(v) => onUpdate({ ...s, sweep: v })} />
        </>
      ) : null}
      {s.kind === "line" || s.kind === "freehand" || s.kind === "arrow" ? <Range label={t("planning.prop.width")} value={s.width} min={1} max={12} unit="px" onChange={(v) => onUpdate({ ...s, width: v })} /> : null}
      {s.kind === "structure" ? <FactionPicker value={s.team ?? null} onChange={(team) => onUpdate({ ...s, team })} /> : null}
      {s.kind === "structure" || s.kind === "order" || s.kind === "point" ? <Range label={t("planning.prop.size")} value={s.size} min={50} max={300} step={10} unit="%" onChange={(v) => onUpdate({ ...s, size: v })} /> : null}
      {s.kind === "line" || s.kind === "freehand" || s.kind === "ruler" || s.kind === "radius" ? <ColorPicker value={s.color} onChange={(color) => onUpdate({ ...s, color })} /> : null}
    </section>
  );
};

/* ───────────── поля ───────────── */

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="flex flex-col gap-1">
    <span className="field-label">{label}</span>
    {children}
  </label>
);

/** Ползунок + точное число: угол и размеры удобно и тянуть, и вводить. */
const Range: React.FC<{ label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void }> = ({ label, value, min, max, step = 1, unit, onChange }) => {
  const clamp = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  return (
    <div className="flex flex-col gap-1">
      <span className="field-label">{label}</span>
      <div className="flex items-center gap-2">
        <input type="range" className="planning-range" min={min} max={max} step={step} value={Math.min(max, value)} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
        <span className="planning-num">
          <input type="number" className="field h-8 w-20 px-2 py-0 text-sm tabular" min={min} max={max} step={step} value={Math.round(value)} onChange={(e) => onChange(clamp(Number(e.target.value)))} aria-label={label} />
          <span className="text-xs text-fg-3">{unit}</span>
        </span>
      </div>
    </div>
  );
};

const ColorPicker: React.FC<{ value: string; onChange: (c: string) => void }> = ({ value, onChange }) => {
  const t = useT();
  return (
    <div className="flex flex-col gap-1">
      <span className="field-label">{t("planning.prop.color")}</span>
      <div className="flex flex-wrap gap-1.5">
        {COLORS.map((c) => (
          <button key={c} type="button" className={cn("planning-swatch", value === c && "is-active")} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} aria-pressed={value === c} />
        ))}
      </div>
    </div>
  );
};

const UnitPicker: React.FC<{ value: Unit; onChange: (u: Unit) => void }> = ({ value, onChange }) => {
  const t = useT();
  return (
    <div className="flex flex-col gap-1">
      <span className="field-label">{t("planning.prop.unit")}</span>
      <div className="grid grid-cols-2 gap-1.5">
        {UNITS.map((u) => (
          <button key={u} type="button" className={cn("planning-unit", value === u && "is-active")} onClick={() => onChange(u)} aria-pressed={value === u}>
            <span className="planning-unit-dot" style={{ background: UNIT_COLOR[u] }} />
            {t(`planning.unit.${u}` as MessageKey)}
          </button>
        ))}
      </div>
    </div>
  );
};

/* ───────────── каталог построек ───────────── */

const StructurePicker: React.FC<{ catalog: StructureCatalog | null; value: string | null; onChange: (id: string) => void }> = ({ catalog, value, onChange }) => {
  const t = useT();
  const [q, setQ] = React.useState("");
  if (!catalog) return <p className="text-sm text-fg-3">{t("planning.loading")}</p>;
  const needle = q.trim().toLowerCase();
  const items = needle ? catalog.items.filter((i) => i.name.toLowerCase().includes(needle)) : catalog.items;
  return (
    <section className="planning-props">
      <h3 className="planning-props-title">{t("planning.structures")}</h3>
      <input className="field h-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("planning.structuresSearch")} aria-label={t("planning.structuresSearch")} />
      <div className="planning-structures">
        {catalog.groups.map((g) => {
          const list = items.filter((i) => i.group === g);
          if (!list.length) return null;
          return (
            <div key={g}>
              <div className="planning-structures-group">{t(`planning.group.${g}` as MessageKey)}</div>
              {list.map((i) => (
                <button key={i.id} type="button" className={cn("planning-structure", value === i.id && "is-active")} onClick={() => onChange(i.id)} aria-pressed={value === i.id}>
                  <span className="planning-structure-icon">
                    {i.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element -- иконка постройки (вики игры), WebP 64px
                      <img src={assetUrl(structureIcon(i.icon)) ?? ""} alt="" width={22} height={22} loading="lazy" />
                    ) : <Icon name="building" size={14} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{i.name}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
};

/* ───────────── фракция построек ───────────── */

const FactionPicker: React.FC<{ value: Faction | null; onChange: (f: Faction) => void }> = ({ value, onChange }) => {
  const t = useT();
  return (
    <div className="flex flex-col gap-1">
      <span className="field-label">{t("planning.prop.faction")}</span>
      <div className="grid grid-cols-2 gap-1.5">
        {FACTIONS.map((f) => (
          <button key={f} type="button" className={cn("planning-unit", value === f && "is-active")} onClick={() => onChange(f)} aria-pressed={value === f}>
            <span className="planning-unit-dot" style={{ background: FACTION_COLOR[f] }} />
            {t(f === "wardens" ? "world.wardens" : "world.colonials")}
          </button>
        ))}
      </div>
    </div>
  );
};

/* ───────────── заказы клана ───────────── */

const OrderPicker: React.FC<{ orders: Report[] | null; member: boolean; value: string | null; onChange: (id: string) => void }> = ({ orders, member, value, onChange }) => {
  const t = useT();
  if (!member) return <p className="text-sm text-fg-3">{t("planning.ordersGuest")}</p>;
  if (!orders) return <p className="text-sm text-fg-3">{t("planning.loading")}</p>;
  return (
    <section className="planning-props">
      <h3 className="planning-props-title">{t("planning.orders")}</h3>
      {orders.length ? (
        <div className="planning-structures">
          {orders.map((o) => (
            <button key={o.id} type="button" className={cn("planning-structure", value === o.id && "is-active")} onClick={() => onChange(o.id)} aria-pressed={value === o.id}>
              <span className="planning-structure-icon"><Icon name="paste" size={15} /></span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate">{o.title}</span>
                <span className="block truncate text-xs text-fg-3">
                  {[t(REPORT_STATUS_LABEL[o.status]), o.meta?.region, t("planning.orderLines", { n: o.lines_count }), formatDateTime(o.created_at)].filter(Boolean).join(" · ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-fg-3">{t("planning.ordersEmpty")}</p>
      )}
    </section>
  );
};

/* ───────────── снимки операций ───────────── */

const SnapshotList: React.FC<{ list: Snapshot[]; onOpen: (s: Snapshot) => void; onRename: (id: string, name: string) => void; onDelete: (id: string) => void; onMove?: () => void }> = ({ list, onOpen, onRename, onDelete, onMove }) => {
  const t = useT();
  const [armed, confirm] = useConfirm();
  return (
    <section className="planning-props">
      <h3 className="planning-props-title">{t("planning.snapshots")}</h3>
      {list.length ? (
        <div className="planning-snaps">
          {list.map((s) => (
            <div key={s.id} className="planning-snap">
              <Icon name="crop" size={15} className="text-fg-3" />
              <span className="min-w-0 flex-1">
                <input className="field h-7 w-full px-1.5 py-0 text-sm" value={s.name} maxLength={60} onChange={(e) => onRename(s.id, e.target.value)} aria-label={t("planning.snapshotRename")} />
                <span className="mt-0.5 block truncate text-xs text-fg-3">{formatDateTime(s.created)}{s.war ? ` · ${t("planning.snapshotWar", { war: s.war })}` : ""}</span>
              </span>
              <button type="button" className="icon-btn" onClick={() => onOpen(s)} aria-label={t("planning.snapshotOpen")} title={t("planning.snapshotOpen")}><Icon name="eye" size={15} /></button>
              <button type="button" className={cn("icon-btn", armed === s.id && "text-danger")} onClick={() => confirm(s.id, () => onDelete(s.id))} aria-label={t("common.delete")} title={armed === s.id ? t("common.confirmQ") : t("common.delete")}><Icon name="trash" size={15} /></button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-fg-3">{t("planning.snapshotsEmpty")}</p>
      )}
      {onMove && list.length ? (
        <button type="button" className="btn btn-primary h-9 min-h-0 justify-center text-sm" onClick={onMove}>
          <Icon name="send" size={15} />
          {t("operations.moveAll", { n: list.length })}
        </button>
      ) : null}
    </section>
  );
};

/** Тип точки плана: цель, сбор, склад, отход, другое. */
const PointPicker: React.FC<{ value: PointKind; onChange: (p: PointKind) => void }> = ({ value, onChange }) => {
  const t = useT();
  return (
    <div className="flex flex-col gap-1">
      <span className="field-label">{t("planning.prop.pointKind")}</span>
      <div className="grid grid-cols-2 gap-1.5">
        {POINT_KINDS.map((p) => (
          <button key={p} type="button" className={cn("planning-unit", value === p && "is-active")} onClick={() => onChange(p)} aria-pressed={value === p}>
            <span aria-hidden style={{ color: POINT_COLOR[p] }}>{POINT_ICON[p]}</span>
            {t(`opsPlan.point.${p}` as MessageKey)}
          </button>
        ))}
      </div>
    </div>
  );
};
