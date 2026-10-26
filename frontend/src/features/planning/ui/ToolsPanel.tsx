"use client";

import * as React from "react";
import { COLORS, TOOLS, UNITS, UNIT_COLOR, normAngle, structureIcon, type Defaults, type Shape, type StructureCatalog, type StructureDef, type Tool, type Unit } from "@/features/planning/model/plan";
import { Icon, assetUrl, cn, useConfirm, useT, type IconName, type MessageKey } from "@/shared";

const TOOL_ICON: Record<Tool, IconName> = { select: "cursor", line: "line", ruler: "ruler", arrow: "arrow", radius: "radius", structure: "building", eraser: "eraser" };

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
}> = ({ tool, onTool, defaults, onDefaults, selected, onUpdate, onDelete, onClear, count, catalog, structures }) => {
  const t = useT();
  const [armed, confirm] = useConfirm();
  const set = <K extends keyof Defaults>(key: K, value: Defaults[K]) => onDefaults({ ...defaults, [key]: value });
  const drawing = tool === "line" || tool === "arrow" || tool === "radius" || tool === "ruler";

  return (
    <div className="flex flex-col gap-4">
      <div className="planning-tools" role="toolbar" aria-label={t("planning.tools")}>
        {TOOLS.map((id) => (
          <button key={id} type="button" className={cn("planning-tool", tool === id && "is-active")} onClick={() => onTool(id)} aria-pressed={tool === id} title={t(`planning.tool.${id}Hint` as MessageKey)}>
            <Icon name={TOOL_ICON[id]} size={18} />
            <span>{t(`planning.tool.${id}` as MessageKey)}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-fg-3">{t(`planning.tool.${tool}Hint` as MessageKey)}</p>

      {selected ? (
        <Properties shape={selected} onUpdate={onUpdate} onDelete={onDelete} structures={structures} />
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
          {tool === "line" || tool === "arrow" ? <Range label={t("planning.prop.width")} value={defaults.width} min={1} max={12} unit="px" onChange={(v) => set("width", v)} /> : null}
          {tool === "radius" ? <Range label={t("planning.prop.sweep")} value={defaults.sweep} min={10} max={360} unit="°" onChange={(v) => set("sweep", v)} /> : null}
        </section>
      ) : null}

      {tool === "structure" && !selected ? <StructurePicker catalog={catalog} value={defaults.structure} onChange={(id) => set("structure", id)} /> : null}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-xs text-fg-3">
        <span>{t("planning.objects", { n: count })} · {t("planning.savedLocal")}</span>
        <button type="button" className={cn("btn h-8 min-h-0 px-2.5 text-xs", armed === "clear" && "text-danger")} disabled={!count} onClick={() => confirm("clear", onClear)}>
          <Icon name="trash" size={14} />
          {armed === "clear" ? t("common.confirmQ") : t("planning.clear")}
        </button>
      </div>
    </div>
  );
};

/* ───────────── свойства выбранного объекта ───────────── */

const Properties: React.FC<{ shape: Shape; onUpdate: (s: Shape) => void; onDelete: (id: string) => void; structures: Map<string, StructureDef> }> = ({ shape, onUpdate, onDelete, structures }) => {
  const t = useT();
  const s = shape;
  const title = s.kind === "structure" ? structures.get(s.ref)?.name ?? t("planning.tool.structure") : t(`planning.tool.${s.kind}` as MessageKey);
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

      <Range label={s.kind === "structure" ? t("planning.prop.rotation") : t("planning.prop.angle")} value={s.angle} min={0} max={359} unit="°" onChange={(v) => onUpdate({ ...s, angle: normAngle(v) })} />

      {s.kind === "line" || s.kind === "ruler" || s.kind === "arrow" ? (
        <Range label={t("planning.prop.length")} value={s.length} min={5} max={5000} step={5} unit="m" onChange={(v) => onUpdate({ ...s, length: v })} />
      ) : null}
      {s.kind === "radius" ? (
        <>
          <Range label={t("planning.prop.radius")} value={s.radius} min={5} max={3000} step={5} unit="m" onChange={(v) => onUpdate({ ...s, radius: v })} />
          <Range label={t("planning.prop.sweep")} value={s.sweep} min={10} max={360} unit="°" onChange={(v) => onUpdate({ ...s, sweep: v })} />
        </>
      ) : null}
      {s.kind === "line" || s.kind === "arrow" ? <Range label={t("planning.prop.width")} value={s.width} min={1} max={12} unit="px" onChange={(v) => onUpdate({ ...s, width: v })} /> : null}
      {s.kind === "structure" ? <Range label={t("planning.prop.size")} value={s.size} min={50} max={300} step={10} unit="%" onChange={(v) => onUpdate({ ...s, size: v })} /> : null}
      {s.kind === "line" || s.kind === "ruler" || s.kind === "radius" ? <ColorPicker value={s.color} onChange={(color) => onUpdate({ ...s, color })} /> : null}
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
