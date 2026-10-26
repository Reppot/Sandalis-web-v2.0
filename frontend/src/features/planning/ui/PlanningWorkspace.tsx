"use client";

import * as React from "react";
import { FILTER_ICON, MAP_KINDS, planningApi, regionsIn, type MapKind, type WorldMap } from "@/features/planning/model/map";
import { DEFAULTS, STRUCTURES_URL, loadDefaults, loadPlan, loadSnapshots, newId, saveDefaults, savePlan, saveSnapshots, type Defaults, type Rect, type Shape, type Snapshot, type StructureCatalog, type StructureDef, type Tool } from "@/features/planning/model/plan";
import { SnapshotViewer } from "@/features/planning/ui/SnapshotViewer";
import { MapCanvas } from "@/features/planning/ui/MapCanvas";
import { ToolsPanel } from "@/features/planning/ui/ToolsPanel";
import { useSession } from "@/features/cabinet";
import { reportApi, type Report } from "@/entities/report";
import { EmptyState, Icon, Loading, assetUrl, cn, errorText, formatDateTime, readStorage, useT, writeStorage, type MessageKey } from "@/shared";

const FILTERS_KEY = "sindaris-planning-hidden";
const SIDE_KEY = "sindaris-planning-side";

/**
 * «Планирование»: карта текущей войны (гексы War API) с ключевыми постройками — ратуши,
 * реликвии, склады, порты, береговые орудия, аэродромы; каждый вид скрывается фильтром.
 * Справа по кнопке открывается панель инструментов: линии, линейка, стрелки войск, радиусы,
 * постройки меню строительства и ластик. План хранится в этом браузере.
 * Между войнами (сопротивление) — только гексы и города и предупреждение.
 */
export const PlanningWorkspace: React.FC = () => {
  const t = useT();
  const [data, setData] = React.useState<WorldMap | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [hidden, setHidden] = React.useState<Set<MapKind>>(new Set());
  const [side, setSide] = React.useState(false);
  const [tool, setTool] = React.useState<Tool>("select");
  const [shapes, setShapes] = React.useState<Shape[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [defaults, setDefaults] = React.useState<Defaults>(DEFAULTS);
  const [catalog, setCatalog] = React.useState<StructureCatalog | null>(null);
  const [snapshots, setSnapshots] = React.useState<Snapshot[]>([]);
  const [viewing, setViewing] = React.useState<Snapshot | null>(null);
  React.useEffect(() => setSnapshots(loadSnapshots()), []);
  const changeSnapshots = React.useCallback((fn: (prev: Snapshot[]) => Snapshot[]) => {
    setSnapshots((prev) => {
      const next = fn(prev);
      saveSnapshots(next);
      return next;
    });
  }, []);
  // активные заказы клана — для меток на карте; у гостя заказов нет
  const { session } = useSession();
  const member = Boolean(session) && session?.subjectType !== "guest";
  const [orders, setOrders] = React.useState<Report[] | null>(null);
  React.useEffect(() => {
    if (!member) return setOrders([]);
    reportApi.list(["open", "in_progress"]).then(setOrders).catch(() => setOrders([]));
  }, [member]);

  React.useEffect(() => {
    setHidden(new Set(readStorage<MapKind[]>(FILTERS_KEY, []).filter((k) => MAP_KINDS.includes(k))));
    setSide(readStorage<boolean>(SIDE_KEY, false));
    setShapes(loadPlan());
    setDefaults(loadDefaults());
  }, []);
  React.useEffect(() => {
    planningApi.map().then(setData).catch((err) => setError(errorText(err, t("planning.loadFailed"))));
  }, [t]);
  // каталог построек нужен и панели, и подписям на карте
  React.useEffect(() => {
    fetch(assetUrl(STRUCTURES_URL) ?? STRUCTURES_URL).then((r) => (r.ok ? r.json() : null)).then(setCatalog).catch(() => setCatalog(null));
  }, []);
  const structures = React.useMemo(() => new Map<string, StructureDef>((catalog?.items ?? []).map((i) => [i.id, i])), [catalog]);

  const commit = React.useCallback((fn: (prev: Shape[]) => Shape[]) => {
    setShapes((prev) => {
      const next = fn(prev);
      savePlan(next);
      return next;
    });
  }, []);
  const editor = React.useMemo(
    () => ({
      tool,
      shapes,
      selected,
      defaults,
      structures,
      orders: orders ?? [],
      onSelect: setSelected,
      onAdd: (s: Shape) => {
        commit((prev) => [...prev, s]);
        // стрелки и линии после рисования сразу выбраны — угол и размер правятся в панели
        if (s.kind !== "structure") setSelected(s.id);
      },
      onUpdate: (s: Shape) => commit((prev) => prev.map((x) => (x.id === s.id ? s : x))),
      onDelete: (id: string) => {
        commit((prev) => prev.filter((x) => x.id !== id));
        setSelected((cur) => (cur === id ? null : cur));
      },
      // снимок: кусок карты (гексы, постройки войны) и копия плана — дальше они не меняются
      onFrame: (rect: Rect) => {
        if (!data) return;
        const snap: Snapshot = {
          id: newId(),
          name: t("planning.snapshotName", { n: snapshots.length + 1 }),
          rect,
          created: new Date().toISOString(),
          war: data.war_number,
          phase: data.phase,
          regions: regionsIn(data.regions, rect),
          shapes: structuredClone(shapes),
        };
        changeSnapshots((prev) => [snap, ...prev]);
        setTool("select");
        setViewing(snap);
      },
    }),
    [tool, shapes, selected, defaults, structures, orders, commit, data, snapshots.length, changeSnapshots, t],
  );

  // Delete — удалить выбранное, Esc — снять выбор и вернуться к курсору
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected) editor.onDelete(selected);
      if (e.key === "Escape") {
        setSelected(null);
        setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, editor]);

  const toggle = (kind: MapKind) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      writeStorage(FILTERS_KEY, [...next]);
      return next;
    });
  const setAll = (hide: boolean) => {
    const next = new Set<MapKind>(hide ? MAP_KINDS : []);
    writeStorage(FILTERS_KEY, [...next]);
    setHidden(next);
  };
  const toggleSide = () =>
    setSide((open) => {
      writeStorage(SIDE_KEY, !open);
      // без панели рисовать нечем — возвращаемся к курсору
      if (open) setTool("select");
      return !open;
    });
  const pickTool = (next: Tool) => {
    setTool(next);
    if (next !== "select") setSelected(null);
  };
  const changeDefaults = (d: Defaults) => {
    setDefaults(d);
    saveDefaults(d);
  };

  const counts = React.useMemo(() => {
    const c = Object.fromEntries(MAP_KINDS.map((k) => [k, 0])) as Record<MapKind, number>;
    for (const r of data?.regions ?? []) for (const it of r.items) c[it.kind] += 1;
    return c;
  }, [data]);
  const resistance = data?.phase === "resistance";
  const selectedShape = shapes.find((s) => s.id === selected) ?? null;

  // карта занимает всё место до низа окна (на телефоне — до нижней панели навигации)
  const page = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const fitHeight = () => {
      const el = page.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const bar = document.querySelector<HTMLElement>(".tabbar");
      // панель навигации на телефоне fixed — у неё нет offsetParent, смотрим display
      const bottom = bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect().height : 0;
      el.style.height = `${Math.max(352, window.innerHeight - top - bottom - 12)}px`;
    };
    fitHeight();
    window.addEventListener("resize", fitHeight);
    return () => window.removeEventListener("resize", fitHeight);
  }, [resistance]);

  return (
    <div ref={page} className="planning-page tab-fade">
      {resistance ? (
        <div className="planning-alert" role="alert">
          <Icon name="warning" size={18} />
          <div className="min-w-0">
            <div className="font-semibold text-fg">{t("planning.resistanceTitle")}</div>
            <div className="mt-0.5 text-sm text-fg-2 max-sm:line-clamp-2">
              {t("planning.resistanceText", {
                war: data?.war_number ?? "—",
                winner: data?.winner ? t(data.winner === "wardens" ? "world.wardens" : "world.colonials") : "—",
              })}
            </div>
          </div>
        </div>
      ) : null}

      <div className={cn("planning", side && "has-side")}>
        <div className="planning-map panel">
          {error ? (
            <EmptyState icon="map" title={t("planning.loadFailed")} hint={error} />
          ) : !data ? (
            <Loading label={t("planning.loading")} />
          ) : (
            <MapCanvas data={data} hidden={hidden} editor={editor} />
          )}

          {data && !resistance ? (
            <div className="planning-overlay is-left">
              <FilterPanel counts={counts} hidden={hidden} onToggle={toggle} onAll={setAll} />
            </div>
          ) : null}
          <div className="planning-overlay is-right">
            <button type="button" className={cn("btn planning-side-btn", side && "is-active")} onClick={toggleSide} aria-expanded={side} aria-controls="planning-side">
              <Icon name="grid" size={16} />
              <span className="max-sm:sr-only">{t("planning.tools")}</span>
            </button>
          </div>
          {data ? (
            <div className="planning-overlay is-bottom">
              <span>{t("planning.updated", { war: data.war_number ?? "—", at: formatDateTime(data.updated_at) })}</span>
              <span className="text-fg-3 max-sm:hidden">{t(resistance ? "planning.hourly" : "planning.daily")}</span>
              <a href="https://github.com/clapfoot/warapi" target="_blank" rel="noreferrer noopener" className="text-fg-3 underline-offset-2 hover:underline max-sm:hidden">{t("planning.source")}</a>
            </div>
          ) : null}
        </div>

        {side ? (
          <aside id="planning-side" className="planning-side panel" aria-label={t("planning.tools")}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="section-title">{t("planning.tools")}</h2>
              <button type="button" className="icon-btn" onClick={toggleSide} aria-label={t("planning.toolsClose")} title={t("planning.toolsClose")}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <ToolsPanel
              tool={tool}
              onTool={pickTool}
              defaults={defaults}
              onDefaults={changeDefaults}
              selected={selectedShape}
              onUpdate={editor.onUpdate}
              onDelete={editor.onDelete}
              onClear={() => {
                commit(() => []);
                setSelected(null);
              }}
              count={shapes.length}
              catalog={catalog}
              structures={structures}
              orders={orders}
              member={member}
              snapshots={snapshots}
              onOpenSnapshot={setViewing}
              onRenameSnapshot={(id, name) => changeSnapshots((prev) => prev.map((x) => (x.id === id ? { ...x, name } : x)))}
              onDeleteSnapshot={(id) => changeSnapshots((prev) => prev.filter((x) => x.id !== id))}
            />
          </aside>
        ) : null}
      </div>
      <SnapshotViewer snapshot={viewing} onClose={() => setViewing(null)} structures={structures} orders={orders ?? []} />
    </div>
  );
};

/* ───────────── фильтры ───────────── */

const FilterPanel: React.FC<{
  counts: Record<MapKind, number>;
  hidden: Set<MapKind>;
  onToggle: (kind: MapKind) => void;
  onAll: (hide: boolean) => void;
}> = ({ counts, hidden, onToggle, onAll }) => {
  const t = useT();
  const [open, setOpen] = React.useState(true);
  // на телефоне список свёрнут, чтобы не закрывать карту
  React.useEffect(() => setOpen(window.matchMedia("(min-width: 768px)").matches), []);
  return (
    <div className="planning-filters">
      <button type="button" className="planning-filters-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Icon name="filter" size={15} />
        <span className="flex-1 text-left">{t("planning.filters")}</span>
        <Icon name="chevronDown" size={15} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <>
          <div className="planning-filters-list">
            {MAP_KINDS.map((kind) => {
              const on = !hidden.has(kind);
              return (
                <button key={kind} type="button" role="switch" aria-checked={on} className={cn("planning-filter", on && "is-on")} onClick={() => onToggle(kind)}>
                  <span className="planning-filter-icon">
                    {/* eslint-disable-next-line @next/next/no-img-element -- иконка War API 48×48 */}
                    <img src={assetUrl(FILTER_ICON[kind]) ?? ""} alt="" width={18} height={18} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{t(`planning.kind.${kind}` as MessageKey)}</span>
                  <span className="planning-filter-n">{counts[kind]}</span>
                </button>
              );
            })}
          </div>
          <div className="planning-filters-foot">
            <button type="button" onClick={() => onAll(false)}>{t("planning.showAll")}</button>
            <button type="button" onClick={() => onAll(true)}>{t("planning.hideAll")}</button>
          </div>
        </>
      ) : null}
    </div>
  );
};
