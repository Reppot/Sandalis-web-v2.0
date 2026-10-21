"use client";

import * as React from "react";
import { useWorld, type Region, type Town } from "@/entities/world";
import { EmptyState, FilterCards, Loading, PagedMore, UiGlyph, errorText, useI18n, usePaged, type MessageKey } from "@/shared";

/** Постройки города: подпись и значок. */
const FACILITY: Record<string, { label: MessageKey; icon: string }> = {
  storage: { label: "world.fac.storage", icon: "📦" },
  seaport: { label: "world.fac.seaport", icon: "⚓" },
  refinery: { label: "world.fac.refinery", icon: "🛢" },
  factory: { label: "world.fac.factory", icon: "🏭" },
  mpf: { label: "world.fac.mpf", icon: "⚙" },
  hospital: { label: "world.fac.hospital", icon: "✚" },
  garage: { label: "world.fac.garage", icon: "🚚" },
  shipyard: { label: "world.fac.shipyard", icon: "🚢" },
  construction_yard: { label: "world.fac.construction_yard", icon: "🏗" },
  engineering: { label: "world.fac.engineering", icon: "🔧" },
  rocket_site: { label: "world.fac.rocket_site", icon: "🚀" },
  intel: { label: "world.fac.intel", icon: "📡" },
  weather: { label: "world.fac.weather", icon: "🌦" },
  aircraft_depot: { label: "world.fac.aircraft_depot", icon: "🛫" },
  aircraft_factory: { label: "world.fac.aircraft_factory", icon: "✈" },
};
const OWNER_LABEL: Record<string, MessageKey> = { colonials: "world.colonials", wardens: "world.wardens", neutral: "world.neutral" };

type Filter = "all" | "colonials" | "wardens" | "storage" | "seaport" | "victory";
const FILTERS: { key: Filter; label: MessageKey }[] = [
  { key: "all", label: "world.filterAll" },
  { key: "storage", label: "world.filterStorage" },
  { key: "seaport", label: "world.filterSeaport" },
  { key: "victory", label: "world.filterVictory" },
  { key: "colonials", label: "world.colonials" },
  { key: "wardens", label: "world.wardens" },
];

const passes = (town: Town, filter: Filter) =>
  filter === "all" ||
  (filter === "victory" ? town.victory : filter === "storage" || filter === "seaport" ? town.facilities.includes(filter) : town.owner === filter);

/** «Регионы и города»: справочник текущей войны — владельцы городов, города победы, депо и порты. */
export const RegionsTool: React.FC = () => {
  const { t } = useI18n();
  const { world, error, reload } = useWorld();
  const [regionKey, setRegionKey] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");

  const region = world?.regions.find((r) => r.key === regionKey) ?? null;
  const needle = query.trim().toLowerCase();

  // города: выбранного региона или (при поиске) всех регионов
  const towns = React.useMemo(() => {
    if (!world) return [];
    const pool = region ? [region] : needle ? world.regions : [];
    return pool.flatMap((r) =>
      r.towns
        .filter((tw) => passes(tw, filter) && (!needle || `${tw.name} ${r.name}`.toLowerCase().includes(needle)))
        .map((tw) => ({ town: tw, region: r })),
    );
  }, [world, region, needle, filter]);
  const page = usePaged(towns, 60, `${regionKey}|${filter}|${needle}`);

  if (error && !world) {
    return (
      <section className="panel panel-corners rounded-md p-6">
        <EmptyState icon="map" title={errorText(error, t("world.unavailable"))}>
          <button type="button" className="btn btn-primary mt-3" onClick={reload}>⟳ {t("common.sync")}</button>
        </EmptyState>
      </section>
    );
  }
  if (!world) return <div className="panel rounded-md"><Loading label={t("world.loading")} /></div>;

  const need = world.war.required_victory_towns ?? 0;
  const vc = world.war.victory_towns.colonials ?? 0;
  const vw = world.war.victory_towns.wardens ?? 0;

  return (
    <div className="tab-fade factory-page pb-24 lg:pb-0">
      <section className="panel panel-corners factory-topbar">
        <div className="flex min-w-0 items-center gap-3">
          <UiGlyph icon="map" size={40} />
          <div className="min-w-0">
            <div className="hud-label text-muted">WAR {world.war.number ?? "—"} • FOXHOLE WAR API</div>
            <h2 className="panel-title mt-1 text-[1.1rem] md:text-[1.45rem]">🗺 {t("tools.regions")}</h2>
            <p className="mt-1 text-sm text-white/65">{t("world.hint")}</p>
          </div>
        </div>
        <div data-guide="world-victory" className="world-victory">
          <VictoryBar label={t("world.colonials")} value={vc} need={need} side="colonials" />
          <VictoryBar label={t("world.wardens")} value={vw} need={need} side="wardens" />
        </div>
      </section>

      <div className="grid min-h-0 flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="panel panel-corners factory-catalog">
          <div className="filter-head">
            <span className="hud-label text-accent">{t("world.regionsTitle", { n: world.regions.length })}</span>
          </div>
          <FilterCards
            guide="world-regions"
            label={t("world.regionsTitle", { n: world.regions.length })}
            items={world.regions.map((r) => ({
              key: r.key,
              label: r.name,
              glyph: "map" as const,
              hint: `${t("world.short.colonials")} ${r.colonials} • ${t("world.short.wardens")} ${r.wardens}${r.victory ? ` • ★ ${r.victory}` : ""}`,
            }))}
            value={regionKey}
            onChange={setRegionKey}
          />
        </section>

        <section className="panel panel-corners factory-catalog">
          <div className="filter-head">
            <span className="hud-label text-accent">{region ? region.name : t("world.townsTitle")}</span>
            <FilterCards compact guide="world-filters" label={t("world.townsTitle")} items={FILTERS.map((f) => ({ key: f.key, label: t(f.label) }))} value={filter} onChange={(k) => setFilter((k as Filter | null) ?? "all")} />
          </div>
          <div className="factory-filters mt-3">
            <input className="field h-11 flex-1" data-guide="world-search" placeholder={t("world.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {region ? <RegionMap region={region} filter={filter} /> : null}

          {!region && !needle ? (
            <div className="hud-label py-6 text-center text-muted">{t("world.pick")}</div>
          ) : towns.length === 0 ? (
            <div className="hud-label py-6 text-center text-muted">{t("common.nothingFound")}</div>
          ) : (
            <>
              <div className="factory-count hud-label mt-3">{t("codes.shown")}: {towns.length}</div>
              <ul className="world-towns">
                {page.items.map(({ town, region: r }) => (
                  <li key={`${r.key}-${town.name}`} className={`world-town owner-${town.owner ?? "none"}`}>
                    <span className="world-town-dot" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="world-town-name">
                        {town.victory ? <span className="text-warn" title={t("world.victory")}>★ </span> : null}
                        {town.name}
                      </span>
                      <span className="world-town-meta">
                        {region ? null : `${r.name} • `}
                        {town.major ? t("world.major") : t("world.minor")}
                        {town.owner ? ` • ${t(OWNER_LABEL[town.owner])}` : ""}
                        {town.scorched ? ` • ${t("world.scorched")}` : ""}
                      </span>
                    </span>
                    <span className="world-facilities">
                      {town.facilities.map((f) => (
                        <span key={f} className={`world-fac ${f === "storage" || f === "seaport" ? "is-key" : ""}`} title={FACILITY[f] ? t(FACILITY[f].label) : f}>
                          {FACILITY[f]?.icon ?? "•"} <span className="world-fac-label">{FACILITY[f] ? t(FACILITY[f].label) : f}</span>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              <PagedMore page={page} />
            </>
          )}
        </section>
      </div>
    </div>
  );
};

const VictoryBar: React.FC<{ label: string; value: number; need: number; side: "colonials" | "wardens" }> = ({ label, value, need, side }) => (
  <div className={`victory-bar side-${side}`}>
    <span className="hud-label">{label}</span>
    <span className="victory-track"><span style={{ width: `${need ? Math.min(100, (value / need) * 100) : 0}%` }} /></span>
    <strong>{value}{need ? ` / ${need}` : ""}</strong>
  </div>
);

/** Мини-карта региона: шестиугольник, города по координатам War API, цвет — владелец. */
const RegionMap: React.FC<{ region: Region; filter: Filter }> = ({ region, filter }) => {
  const { t } = useI18n();
  const H = 86.6;
  return (
    <figure data-guide="world-map" className="world-map">
      <svg viewBox={`-2 -2 104 ${H + 4}`} role="img" aria-label={region.name}>
        <polygon className="world-hex" points={`25,0 75,0 100,${H / 2} 75,${H} 25,${H} 0,${H / 2}`} />
        {region.towns.map((town) => {
          const dim = !passes(town, filter);
          return (
            <g key={town.name} className={`world-pin owner-${town.owner ?? "none"} ${dim ? "is-dim" : ""}`} transform={`translate(${town.x * 100} ${town.y * H})`}>
              <title>{`${town.name}${town.owner ? ` — ${t(OWNER_LABEL[town.owner])}` : ""}`}</title>
              {town.victory ? <path d="M0,-3.4 1,-1 3.4,-1 1.5,0.5 2.2,3 0,1.5 -2.2,3 -1.5,0.5 -3.4,-1 -1,-1Z" /> : <circle r={town.major ? 1.9 : 1.1} />}
              {town.major ? <text y={-3.2}>{town.name}</text> : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
};
