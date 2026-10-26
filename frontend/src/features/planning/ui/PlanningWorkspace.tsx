"use client";

import * as React from "react";
import { FILTER_ICON, HEX_H, HEX_W, MAP_KINDS, hexLeft, hexTop, iconOf, planningApi, type MapItem, type MapKind, type MapRegion, type WorldMap } from "@/features/planning/model/map";
import { EmptyState, Icon, Loading, assetUrl, cn, errorText, formatDateTime, readStorage, useT, writeStorage, type IconName, type MessageKey } from "@/shared";

const FILTERS_KEY = "sindaris-planning-hidden";
const SIDE_KEY = "sindaris-planning-side";
const MIN_SCALE = 0.05;
const MAX_SCALE = 2.5;
const NO_ICON: Partial<Record<MapKind, IconName>> = { lighthouse: "flag", aa_gun: "shield" };

interface View {
  scale: number;
  x: number;
  y: number;
}

/**
 * «Планирование»: карта текущей войны (гексы War API) с ключевыми постройками — ратуши,
 * реликвии, склады, порты, береговые орудия, аэродромы. Каждый вид скрывается фильтром.
 * Карта занимает всё место; справа по кнопке открывается панель инструментов (пока пустая).
 */
export const PlanningWorkspace: React.FC = () => {
  const t = useT();
  const [data, setData] = React.useState<WorldMap | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [hidden, setHidden] = React.useState<Set<MapKind>>(new Set());
  const [side, setSide] = React.useState(false);

  React.useEffect(() => {
    setHidden(new Set(readStorage<MapKind[]>(FILTERS_KEY, [])));
    setSide(readStorage<boolean>(SIDE_KEY, false));
  }, []);
  React.useEffect(() => {
    planningApi.map().then(setData).catch((err) => setError(errorText(err, t("planning.loadFailed"))));
  }, [t]);

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
      return !open;
    });

  const counts = React.useMemo(() => {
    const c = Object.fromEntries(MAP_KINDS.map((k) => [k, 0])) as Record<MapKind, number>;
    for (const r of data?.regions ?? []) for (const it of r.items) c[it.kind] += 1;
    return c;
  }, [data]);

  return (
    <div className={cn("planning tab-fade", side && "has-side")}>
      <div className="planning-map panel">
        {error ? (
          <EmptyState icon="map" title={t("planning.loadFailed")} hint={error} />
        ) : !data ? (
          <Loading label={t("planning.loading")} />
        ) : (
          <MapCanvas data={data} hidden={hidden} />
        )}

        <div className="planning-overlay is-left">
          <FilterPanel counts={counts} hidden={hidden} unavailable={data?.unavailable ?? []} onToggle={toggle} onAll={setAll} />
        </div>
        <div className="planning-overlay is-right">
          <button type="button" className={cn("btn planning-side-btn", side && "is-active")} onClick={toggleSide} aria-expanded={side} aria-controls="planning-side">
            <Icon name="grid" size={16} />
            <span className="max-sm:sr-only">{t("planning.tools")}</span>
          </button>
        </div>
        {data ? (
          <div className="planning-overlay is-bottom">
            <span>{t("planning.updated", { war: data.war_number ?? "—", at: formatDateTime(data.updated_at) })}</span>
            <span className="text-fg-3 max-sm:hidden">{t("planning.daily")}</span>
            <a href="https://github.com/clapfoot/warapi" target="_blank" rel="noreferrer noopener" className="text-fg-3 underline-offset-2 hover:underline max-sm:hidden">{t("planning.source")}</a>
          </div>
        ) : null}
      </div>

      {side ? (
        <aside id="planning-side" className="planning-side panel" aria-label={t("planning.tools")}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="section-title">{t("planning.tools")}</h2>
            <button type="button" className="icon-btn" onClick={toggleSide} aria-label={t("planning.toolsClose")} title={t("planning.toolsClose")}>
              <Icon name="close" size={16} />
            </button>
          </div>
          <p className="mt-3 text-sm text-fg-3">{t("planning.toolsEmpty")}</p>
        </aside>
      ) : null}
    </div>
  );
};

/* ───────────── фильтры ───────────── */

const FilterPanel: React.FC<{
  counts: Record<MapKind, number>;
  hidden: Set<MapKind>;
  unavailable: MapKind[];
  onToggle: (kind: MapKind) => void;
  onAll: (hide: boolean) => void;
}> = ({ counts, hidden, unavailable, onToggle, onAll }) => {
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
              const missing = unavailable.includes(kind);
              const on = !hidden.has(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  role="switch"
                  aria-checked={on && !missing}
                  disabled={missing}
                  className={cn("planning-filter", on && !missing && "is-on")}
                  onClick={() => onToggle(kind)}
                  title={missing ? t("planning.noDataHint") : undefined}
                >
                  <span className="planning-filter-icon">
                    {FILTER_ICON[kind] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- иконка War API 48×48
                      <img src={assetUrl(FILTER_ICON[kind]) ?? ""} alt="" width={18} height={18} />
                    ) : (
                      <Icon name={NO_ICON[kind] ?? "info"} size={14} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{t(`planning.kind.${kind}` as MessageKey)}</span>
                  <span className="planning-filter-n">{missing ? t("planning.noData") : counts[kind]}</span>
                </button>
              );
            })}
          </div>
          <div className="planning-filters-foot">
            <button type="button" className="link-btn" onClick={() => onAll(false)}>{t("planning.showAll")}</button>
            <button type="button" className="link-btn" onClick={() => onAll(true)}>{t("planning.hideAll")}</button>
          </div>
        </>
      ) : null}
    </div>
  );
};

/* ───────────── карта: панорама и масштаб ───────────── */

const MapCanvas: React.FC<{ data: WorldMap; hidden: Set<MapKind> }> = ({ data, hidden }) => {
  const t = useT();
  const box = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState<View | null>(null);
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const pinch = React.useRef<number | null>(null);

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

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
    } else {
      setView((v) => (v ? { ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y } : v));
    }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const scale = view?.scale ?? 0.1;
  // маркеры держат экранный размер; на общем плане чуть мельче, чтобы не слипались
  const marker = 1 / scale * Math.min(1, Math.max(0.4, scale * 5));

  return (
    <div
      ref={box}
      className="planning-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        zoomAt(1.8, e.clientX - r.left, e.clientY - r.top);
      }}
    >
      {view ? (
        <div className="planning-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
          {data.regions.map((r) => (
            <Hex key={r.key} region={r} hidden={hidden} marker={marker} showTowns={scale > 0.35} />
          ))}
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

const Hex: React.FC<{ region: MapRegion; hidden: Set<MapKind>; marker: number; showTowns: boolean }> = React.memo(({ region, hidden, marker, showTowns }) => {
  const t = useT();
  const items = region.items.filter((it) => !hidden.has(it.kind));
  return (
    <div className="planning-hex" style={{ left: hexLeft(region.col), top: hexTop(region.row), width: HEX_W, height: HEX_H }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- карта региона War API, WebP */}
      <img src={assetUrl(`/api/v1/assets/maps/hex/${region.slug}.webp`) ?? ""} alt={region.name} width={HEX_W} height={HEX_H} draggable={false} loading="lazy" />
      {showTowns
        ? region.labels.map((l) => (
            <span key={l.text} className="planning-town" style={{ left: l.x * HEX_W, top: l.y * HEX_H, transform: `translate(-50%, 60%) scale(${marker})` }}>{l.text}</span>
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
