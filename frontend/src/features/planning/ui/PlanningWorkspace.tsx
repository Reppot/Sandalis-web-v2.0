"use client";

import * as React from "react";
import { FILTER_ICON, MAP_KINDS, planningApi, regionsIn, type MapKind, type WorldMap } from "@/features/planning/model/map";
import { DEFAULTS, STRUCTURES_URL, loadDefaults, loadPlan, loadSnapshots, newId, saveDefaults, savePlan, saveSnapshots, type Defaults, type Rect, type Shape, type Snapshot, type StructureCatalog, type StructureDef, type Tool } from "@/features/planning/model/plan";
import { SnapshotViewer } from "@/features/planning/ui/SnapshotViewer";
import { useClanPlan } from "@/features/planning/model/clanPlan";
import { OperationDialog } from "@/features/operations/ui/OperationDialog";
import { toOperationSnapshot } from "@/features/operations/model/operations";
import { Scopes } from "@/entities/session";
import { MapCanvas } from "@/features/planning/ui/MapCanvas";
import { ToolsPanel } from "@/features/planning/ui/ToolsPanel";
import { useSession } from "@/features/cabinet";
import { reportApi, type Report } from "@/entities/report";
import { EmptyState, Icon, Loading, assetUrl, cn, errorText, formatDateTime, readStorage, useNotify, useT, writeStorage, type MessageKey } from "@/shared";

const FILTERS_KEY = "sindaris-planning-hidden";
const SIDE_KEY = "sindaris-planning-side";
const MODE_KEY = "sindaris-planning-mode";
type PlanMode = "mine" | "clan";

/**
 * «Планирование»: карта текущей войны (гексы War API) с ключевыми постройками — ратуши,
 * реликвии, склады, порты, береговые орудия, аэродромы; каждый вид скрывается фильтром.
 * Справа по кнопке открывается панель инструментов: линии, линейка, стрелки войск, радиусы,
 * постройки меню строительства и ластик. План — свой (в этом браузере) или общий план клана,
 * который офицеры рисуют вместе (сервер, правки видны всем через несколько секунд).
 * Между войнами (сопротивление) — только гексы и города и предупреждение.
 */
export const PlanningWorkspace: React.FC = () => {
  const t = useT();
  const notify = useNotify();
  const [data, setData] = React.useState<WorldMap | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [hidden, setHidden] = React.useState<Set<MapKind>>(new Set());
  const [regionSelection, setRegionSelection] = React.useState<Set<string>>(() => new Set());
  const [detailsLoading, setDetailsLoading] = React.useState(false);
  const [showFrontline, setShowFrontline] = React.useState(false);
  const [frontlinePoints, setFrontlinePoints] = React.useState<Awaited<ReturnType<typeof planningApi.frontline>>["points"] | null>(null);
  const [frontlineLoading, setFrontlineLoading] = React.useState(false);
  const [selectingRegions, setSelectingRegions] = React.useState(false);
  const [side, setSide] = React.useState(false);
  const [tool, setTool] = React.useState<Tool>("select");
  const [shapes, setShapes] = React.useState<Shape[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [defaults, setDefaults] = React.useState<Defaults>(DEFAULTS);
  const [catalog, setCatalog] = React.useState<StructureCatalog | null>(null);
  const [snapshots, setSnapshots] = React.useState<Snapshot[]>([]);
  const [viewing, setViewing] = React.useState<Snapshot | null>(null);
  // «Перенести в операции»: снимок уходит в календарь операций клана
  // переносятся все снимки сессии планирования — в одну операцию
  const [moving, setMoving] = React.useState(false);
  React.useEffect(() => setSnapshots(loadSnapshots()), []);
  const changeSnapshots = React.useCallback((fn: (prev: Snapshot[]) => Snapshot[]) => {
    setSnapshots((prev) => {
      const next = fn(prev);
      saveSnapshots(next);
      return next;
    });
  }, []);
  // активные заказы клана — для меток на карте; у гостя заказов нет
  const { session, can } = useSession();
  const member = Boolean(session) && session?.subjectType !== "guest";
  const canMove = member && can(Scopes.OPERATIONS_CREATE);
  const canClan = member && can(Scopes.OPERATIONS_READ);
  const [mode, setMode] = React.useState<PlanMode>("mine");
  React.useEffect(() => setMode(readStorage<PlanMode>(MODE_KEY, "mine")), []);
  const clanMode = canClan && mode === "clan";
  const clan = useClanPlan(clanMode, (err) => notify({ title: t("planning.clanPlan"), message: errorText(err, t("planning.clanSaveFailed")), tone: "danger" }));
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
    planningApi.overview().then(setData).catch((err) => setError(errorText(err, t("planning.loadFailed"))));
  }, [t]);
  const toggleRegion = (key: string) => setRegionSelection((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const toggleFrontline = async () => {
    if (showFrontline) {
      setShowFrontline(false);
      return;
    }
    setShowFrontline(true);
    if (frontlinePoints !== null || frontlineLoading) return;
    setFrontlineLoading(true);
    try {
      const result = await planningApi.frontline();
      setFrontlinePoints(result.points);
    } catch (err) {
      setShowFrontline(false);
      notify({ title: t("planning.frontline"), message: errorText(err, t("planning.loadFailed")), tone: "danger" });
    } finally {
      setFrontlineLoading(false);
    }
  };
  const selectedKeys = React.useMemo(() => [...regionSelection].sort(), [regionSelection]);
  React.useEffect(() => {
    if (!data) return;
    if (selectedKeys.length === 0) {
      setDetailsLoading(false);
      setData((current) => current ? { ...current, regions: current.regions.map((region) => ({ ...region, items: [] })) } : current);
      return;
    }
    let cancelled = false;
    setDetailsLoading(selectedKeys.length > 0);
    const timer = window.setTimeout(() => {
      planningApi.regions(selectedKeys).then((details) => {
        if (cancelled) return;
        const byKey = new Map(details.regions.map((region) => [region.key, region.items]));
        setData((current) => current ? {
          ...current,
          updated_at: details.updated_at,
          regions: current.regions.map((region) => ({ ...region, items: byKey.get(region.key) ?? [] })),
        } : current);
      }).catch((err) => {
        if (!cancelled) notify({ title: t("planning.regions", { n: selectedKeys.length }), message: errorText(err, t("planning.loadFailed")), tone: "danger" });
      }).finally(() => {
        if (!cancelled) setDetailsLoading(false);
      });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [data?.war_number, regionSelection, selectedKeys, t, notify]);
  // каталог построек нужен и панели, и подписям на карте
  React.useEffect(() => {
    fetch(assetUrl(STRUCTURES_URL) ?? STRUCTURES_URL).then((r) => (r.ok ? r.json() : null)).then(setCatalog).catch(() => setCatalog(null));
  }, []);
  const structures = React.useMemo(() => new Map<string, StructureDef>((catalog?.items ?? []).map((i) => [i.id, i])), [catalog]);

  const commitMine = React.useCallback((fn: (prev: Shape[]) => Shape[]) => {
    setShapes((prev) => {
      const next = fn(prev);
      savePlan(next);
      return next;
    });
  }, []);
  // план клана без права правки — только смотреть
  const locked = clanMode && !clan.canEdit;
  const plan = clanMode ? clan.shapes : shapes;
  const commit = React.useMemo(() => (clanMode ? (locked ? () => undefined : clan.commit) : commitMine), [clanMode, locked, clan.commit, commitMine]);
  const switchMode = (next: PlanMode) => {
    setMode(next);
    writeStorage(MODE_KEY, next);
    setSelected(null);
    setTool("select");
  };
  const editor = React.useMemo(
    () => ({
      tool: locked ? ("select" as Tool) : tool,
      shapes: plan,
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
          frontline: showFrontline ? frontlinePoints ?? [] : [],
          shapes: structuredClone(plan),
        };
        changeSnapshots((prev) => [snap, ...prev]);
        setTool("select");
        setViewing(snap);
      },
    }),
    [tool, locked, plan, selected, defaults, structures, orders, commit, data, snapshots.length, changeSnapshots, t],
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
  const selectedShape = locked ? null : plan.find((s) => s.id === selected) ?? null;

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
        <div data-guide="planning-map" className="planning-map panel">
          {error ? (
            <EmptyState icon="map" title={t("planning.loadFailed")} hint={error} />
          ) : !data ? (
            <Loading label={t("planning.loading")} />
          ) : (
            <MapCanvas data={data} hidden={hidden} editor={editor} selectedRegions={regionSelection} onToggleRegion={toggleRegion} selectingRegions={selectingRegions} frontlinePoints={showFrontline ? frontlinePoints : null} />
          )}

          {data && !resistance ? (
            <div className="planning-overlay is-left">
              <FilterPanel counts={counts} hidden={hidden} onToggle={toggle} onAll={setAll} />
            </div>
          ) : null}
          {data && !resistance ? (
            <div className="planning-overlay is-regions">
              <button data-guide="planning-regions" type="button" className={cn("btn planning-side-btn", selectingRegions && "is-active")} onClick={() => setSelectingRegions((v) => !v)} aria-pressed={selectingRegions}>
                <Icon name="map" size={15} /> {t("planning.regions", { n: regionSelection.size })}
              </button>
              {selectingRegions ? <div data-guide="planning-region-actions" className="planning-region-actions">
                <span>{t("planning.regionsHint")}</span>
                <button type="button" onClick={() => setRegionSelection(new Set(data.regions.map((r) => r.key)))}>{t("planning.regionsAll")}</button>
                <button type="button" onClick={() => setRegionSelection(new Set())}>{t("planning.regionsNone")}</button>
                <button type="button" onClick={() => setSelectingRegions(false)}>{t("planning.regionsDone")}</button>
              </div> : null}
            </div>
          ) : null}
          <div className="planning-overlay is-right">
            {!resistance ? <button data-guide="planning-frontline-toggle" type="button" className={cn("btn planning-side-btn", showFrontline && "is-active")} onClick={() => void toggleFrontline()} aria-pressed={showFrontline} disabled={frontlineLoading} title={t("planning.frontline")}>
              <Icon name="map" size={15} /><span>{frontlineLoading ? t("planning.frontlineLoading") : t("planning.frontlineToggle")}</span>
            </button> : null}
            <button data-guide="planning-tools-toggle" type="button" className={cn("btn planning-side-btn", side && "is-active")} onClick={toggleSide} aria-expanded={side} aria-controls="planning-side">
              <Icon name="grid" size={16} />
              <span className="max-sm:sr-only">{t("planning.tools")}</span>
            </button>
          </div>
          {data ? (
            <div className="planning-overlay is-bottom">
              <span>{detailsLoading ? t("planning.regionLoading") : t("planning.updated", { war: data.war_number ?? "—", at: formatDateTime(data.updated_at) })}</span>
              <span className="text-fg-3 max-sm:hidden">{t(resistance ? "planning.hourly" : "planning.daily")}</span>
              <a href="https://github.com/clapfoot/warapi" target="_blank" rel="noreferrer noopener" className="text-fg-3 underline-offset-2 hover:underline max-sm:hidden">{t("planning.source")}</a>
            </div>
          ) : null}
        </div>

        {side ? (
          <aside id="planning-side" data-guide="planning-tools-panel" className="planning-side panel" aria-label={t("planning.tools")}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="section-title">{t("planning.tools")}</h2>
              <button type="button" className="icon-btn" onClick={toggleSide} aria-label={t("planning.toolsClose")} title={t("planning.toolsClose")}>
                <Icon name="close" size={16} />
              </button>
            </div>
            {canClan ? (
              <div className="mb-3 flex flex-col gap-2">
                <div className="segmented self-start" role="group" aria-label={t("planning.planMode")}>
                  <button type="button" className={cn("segmented-item", !clanMode && "is-active")} onClick={() => switchMode("mine")}>{t("planning.myPlan")}</button>
                  <button type="button" className={cn("segmented-item", clanMode && "is-active")} onClick={() => switchMode("clan")}>
                    <Icon name="users" size={14} />
                    {t("planning.clanPlan")}
                  </button>
                </div>
                {clanMode ? (
                  <p className="text-xs text-fg-3">
                    {!clan.ready ? t("planning.loading")
                      : clan.saving ? t("planning.clanSaving")
                      : clan.updatedAt ? t("planning.clanUpdated", { name: clan.updatedBy || "—", at: formatDateTime(clan.updatedAt) })
                      : t("planning.clanEmpty")}
                    {locked ? ` · ${t("planning.clanReadOnly")}` : ""}
                  </p>
                ) : null}
                {clanMode && clan.canEdit && shapes.length ? (
                  <button type="button" className="btn h-8 min-h-0 self-start text-xs" onClick={() => {
                    const have = new Set(clan.shapes.map((s) => s.id));
                    commit((prev) => [...prev, ...shapes.filter((s) => !have.has(s.id))]);
                    notify({ title: t("planning.clanPlan"), message: t("planning.clanCopied", { n: shapes.filter((s) => !have.has(s.id)).length }), tone: "success" });
                  }}>
                    <Icon name="upload" size={14} />
                    {t("planning.copyMine", { n: shapes.length })}
                  </button>
                ) : null}
              </div>
            ) : null}
            <ToolsPanel
              locked={locked}
              savedLabel={clanMode ? t("planning.savedClan") : t("planning.savedLocal")}
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
              count={plan.length}
              catalog={catalog}
              structures={structures}
              orders={orders}
              member={member}
              snapshots={snapshots}
              onOpenSnapshot={setViewing}
              onRenameSnapshot={(id, name) => changeSnapshots((prev) => prev.map((x) => (x.id === id ? { ...x, name } : x)))}
              onDeleteSnapshot={(id) => changeSnapshots((prev) => prev.filter((x) => x.id !== id))}
              onMoveSnapshots={canMove ? () => setMoving(true) : undefined}
            />
          </aside>
        ) : null}
      </div>
      <SnapshotViewer
        snapshot={viewing}
        onClose={() => setViewing(null)}
        structures={structures}
        orders={orders ?? []}
        onMove={canMove ? () => { setViewing(null); setMoving(true); } : undefined}
        moveCount={snapshots.length}
      />
      <OperationDialog open={moving} onClose={() => setMoving(false)} snapshots={moving ? snapshots.map(toOperationSnapshot) : []} initialTitle={snapshots[0]?.name ?? ""} />
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
