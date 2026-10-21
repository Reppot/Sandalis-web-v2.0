"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { MPF_MIN_CRATES, mpfData, mpfOrderCost, mpfOrders, type Recipe } from "@/entities/recipe";
import { FilterCards, ItemIcon, QuantityStepper, assetUrl, buildTxt, copyText, formatDuration, timeUnits, UiGlyph, useI18n, useNotify } from "@/shared";
import { ResourceSummaryPanel, toolDoc, type ToolReport } from "@/features/tools/ui/ResourceSummaryPanel";
import { FACTION_FILTERS, PaneToggles, paneCardsClass, paneGridClass, usePanes } from "@/features/tools/ui/ToolPanes";

type Facility = "factory" | "mpf";

const isShippable = (recipe: Recipe) => recipe.category === "vehicles" || recipe.category === "shipables";

/** Игровой лимит заказа (режим PRODUCTION): MPF — 9 ящиков предметов / 5 техники и сооружений. */
function queueLimit(recipe: Recipe, facility: Facility): number {
  if (facility === "mpf") return mpfData(recipe)?.max_crates ?? (isShippable(recipe) ? 5 : 9);
  return isShippable(recipe) ? 5 : 4;
}

/** Цена ящика: в MPF — база из таблиц MPF, иначе — цена Factory. */
const crateCost = (recipe: Recipe, facility: Facility) => (facility === "mpf" ? mpfData(recipe)?.cost : undefined) ?? recipe.cost;

/** Сколько ресурса уйдёт на crates ящиков (MPF — по заказам со скидкой). */
function resourceCost(base: number, crates: number, recipe: Recipe, facility: Facility, planning: boolean): number {
  if (facility !== "mpf") return base * crates;
  const orders = planning ? mpfOrders(crates, queueLimit(recipe, facility)) : [crates];
  return orders.reduce((sum, n) => sum + mpfOrderCost(base, n), 0);
}

export const FactoryCalculator: React.FC<{ facility: Facility; recipes: Recipe[] }> = ({ facility, recipes }) => {
  const notify = useNotify();
  const { t, locale } = useI18n();
  const rname = React.useCallback((r: Recipe) => (locale === "ru" ? r.name : r.name_en ?? r.name), [locale]);
  const { label, labelIcon } = useContent();
  const [planning, setPlanning] = React.useState(false);
  const [faction, setFaction] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [plan, setPlan] = React.useState<Record<string, number>>({});
  const panes = usePanes();

  // рецепты под фракцией и режимом — от них считаются карточки категорий
  const base = React.useMemo(
    () => recipes.filter((r) => (faction === "all" || r.factions.includes(faction)) && (facility === "mpf" ? r.facilities.includes("mpf") : planning || r.facilities.includes(facility))),
    [recipes, faction, facility, planning],
  );
  const categories = React.useMemo(() => {
    const map = new Map<string, { icon: string | null; count: number }>();
    for (const r of base) {
      const entry = map.get(r.category) ?? { icon: assetUrl(r.icon_url), count: 0 };
      entry.count += 1;
      map.set(r.category, entry);
    }
    return [...map];
  }, [base]);
  const byId = React.useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return recipes.filter(
      (r) =>
        (faction === "all" || r.factions.includes(faction)) &&
        (facility === "mpf" ? r.facilities.includes("mpf") : planning || r.facilities.includes(facility)) &&
        (category === "all" || r.category === category) &&
        (!needle || `${r.name} ${r.name_en ?? ""} ${r.item_class ?? ""} ${r.description ?? ""}`.toLowerCase().includes(needle)),
    );
  }, [recipes, faction, planning, facility, category, query]);

  const rows = React.useMemo(
    () => Object.entries(plan).flatMap(([id, crates]) => (byId.get(id) && crates > 0 ? [{ recipe: byId.get(id)!, crates }] : [])),
    [plan, byId],
  );

  const report = React.useMemo<ToolReport>(() => {
    const materials: Record<string, number> = {};
    let crates = 0;
    let fullPrice = 0;
    let paid = 0;
    // MPF: в каждой категории заказы идут друг за другом, категории — параллельно
    const categorySeconds: Record<string, number> = {};
    for (const { recipe, crates: qty } of rows) {
      crates += qty;
      for (const [key, value] of Object.entries(crateCost(recipe, facility))) {
        const base = Number(value) || 0;
        const cost = resourceCost(base, qty, recipe, facility, planning);
        materials[key] = (materials[key] ?? 0) + cost;
        fullPrice += base * qty;
        paid += cost;
      }
      const perCrate = facility === "mpf" ? mpfData(recipe)?.seconds ?? 0 : 60;
      categorySeconds[recipe.category] = (categorySeconds[recipe.category] ?? 0) + perCrate * qty;
    }
    const seconds = facility === "mpf" ? Math.max(0, ...Object.values(categorySeconds)) : crates * 60;
    const isFactory = facility === "factory";
    return {
      toolName: isFactory ? t("tools.factory") : "MPF — Mass Production Factory",
      subtitle: `${isFactory ? "Factory" : "Mass Production Factory"} • ${planning ? t("tools.planningMode") : t("tools.productionMode")}`,
      fileBase: isFactory ? "SINDARIS_factory" : "SINDARIS_MPF",
      items: rows.map(({ recipe, crates: q }) => ({ name: rname(recipe), quantity: q, unit: t("unit.crate"), icon: assetUrl(recipe.icon_url) })),
      resources: Object.entries(materials).map(([key, value]) => ({ name: label("material", key), quantity: Math.round(value), unit: t("unit.unit"), icon: labelIcon("material", key) })),
      stats: [
        { name: t("tools.crates"), quantity: crates, unit: t("unit.crate") },
        { name: t("tools.time"), quantity: formatDuration(seconds, timeUnits(t)), unit: "" },
        ...(isFactory || !fullPrice ? [] : [{ name: t("tools.mpfDiscount"), quantity: `${(((fullPrice - paid) / fullPrice) * 100).toFixed(1)}%`, unit: "" }]),
      ],
    };
  }, [rows, facility, planning, label, labelIcon, t, rname]);

  /** requested — число или функция от текущего количества (клик ＋ по карточке). */
  const setQuantity = (recipe: Recipe, requested: number | ((current: number) => number)) => {
    const limit = queueLimit(recipe, facility);
    setPlan((prev) => {
      const current = prev[recipe.id] ?? 0;
      const wanted = Math.max(0, Math.floor(typeof requested === "function" ? requested(current) : requested));
      let next = !planning && wanted > limit ? limit : wanted;
      // заказ MPF — минимум 3 ящика: первый клик сразу даёт 3, уменьшение ниже 3 убирает позицию
      if (facility === "mpf" && !planning && next > 0 && next < MPF_MIN_CRATES) next = wanted < current ? 0 : MPF_MIN_CRATES;
      if (next !== wanted && wanted > limit) {
        window.setTimeout(() => notify({ title: t("tools.queueLimit"), message: t("tools.queueLimitMsg", { name: rname(recipe), limit }), tone: "warning" }));
      }
      const copy = { ...prev };
      if (next) copy[recipe.id] = next;
      else delete copy[recipe.id];
      return copy;
    });
  };

  return (
    <div className="tab-fade factory-page pb-24 lg:pb-0">
      <section className="panel panel-corners factory-topbar">
        <div className="flex min-w-0 items-center gap-3">
          <UiGlyph icon={facility === "factory" ? "factory" : "mpf"} size={40} />
          <div className="min-w-0">
            <div className="hud-label text-muted">PRODUCTION PLANNER • FOXHOLE</div>
            <h2 className="panel-title mt-1 text-[1.1rem] md:text-[1.45rem]">⚙ {facility === "factory" ? t("tools.factory") : "MPF — Mass Production Factory"}</h2>
            <p className="mt-1 text-sm text-white/65">
              {facility === "factory"
                ? t("tools.factoryHint")
                : t("tools.mpfHint")}
            </p>
          </div>
        </div>
        <div className="factory-controls">
          <button className={`btn ${planning ? "btn-warn btn-active" : ""}`} data-guide="tool-mode" onClick={() => setPlanning((v) => !v)}>{planning ? "PLANNING" : "PRODUCTION"}</button>
          <button className="btn btn-primary" onClick={() => void copyText(buildTxt(toolDoc(report, t))).then((ok) => notify(ok ? { title: "FACTORY PLAN", message: t("tools.planCopied"), tone: "success" } : { title: t("export.clipboardTitle"), message: t("tools.copyFailed"), tone: "warning" }))}>
            ⧉ {t("tools.sharePlan")}
          </button>
        </div>
      </section>

      <PaneToggles panes={panes} catalogLabel={t("tools.catalogPane")} planLabel={t("tools.productionQueue")} />

      <div className={paneGridClass(panes)} data-wide={panes.wide}>
        <section className={`panel panel-corners factory-catalog ${panes.catalog ? "" : "hidden"}`}>
          <div className="filter-head">
            <span className="hud-label text-accent">{t("tools.categories")}</span>
            <FilterCards
            compact
            guide="tool-factions"
            label={t("tools.faction")}
            items={FACTION_FILTERS.map((f) => ({ key: f.key, label: t(f.label) }))}
            value={faction}
            onChange={(k) => setFaction(k ?? "all")}
          />
          </div>
          <FilterCards
            guide="tool-cats"
            label={t("tools.categories")}
            items={[
              { key: "all", label: t("common.all"), glyph: facility === "mpf" ? "mpf" : "factory", hint: t("facility.items", { n: base.length }) },
              ...categories.map(([key, v]) => ({ key, label: label("factory_category", key), icon: v.icon, hint: t("facility.items", { n: v.count }) })),
            ]}
            value={category}
            onChange={(k) => setCategory(k ?? "all")}
          />
          <div className="factory-filters mt-3">
            <input className="field h-11 flex-1" data-guide="tool-search" placeholder={t("tools.factorySearch")} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="factory-count hud-label">{t("codes.shown")}: {visible.length} / {recipes.length}</div>

          <div className={paneCardsClass(panes)}>
            {visible.map((recipe) => {
              const queued = plan[recipe.id] ?? 0;
              return (
                <button key={recipe.id} type="button" className={`factory-item-card relative min-h-[14rem] flex-col justify-start gap-2 p-3 text-center ${queued ? "border-accent" : ""}`} onClick={() => setQuantity(recipe, (n) => n + 1)} title={recipe.description ?? undefined}>
                  <span className="factory-add absolute top-2 right-2">＋</span>
                  {queued ? <span className="absolute top-2 left-2 rounded-sm border border-[#16a34a] bg-[#1e291b] px-1.5 py-0.5 font-mono text-[0.65rem] text-accent">{queued} {t("unit.crate")}</span> : null}
                  <ItemIcon sources={[assetUrl(recipe.icon_url)]} size={88} label={rname(recipe)} className="mt-3" />
                  <strong className="line-clamp-2 min-h-[2.5em] w-full text-[0.82rem] leading-tight text-white">{rname(recipe)}</strong>
                  <small className="block w-full truncate text-[0.7rem] text-muted">{recipe.item_class ?? label("factory_category", recipe.category)} • x{(facility === "mpf" ? mpfData(recipe)?.amount : undefined) ?? recipe.output_quantity}</small>
                  <span className="mt-auto flex flex-wrap justify-center gap-1">
                    {Object.entries(crateCost(recipe, facility)).map(([key, value]) => (
                      <span key={key} className="rounded-sm border border-white/10 bg-black/30 px-1.5 py-0.5 font-mono text-[0.62rem] text-white/80">{label("material", key)} {value}</span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <ResourceSummaryPanel report={report} title={t("tools.productionQueue")} emptyHint={t("tools.queueHint")} onClear={() => setPlan({})} hidden={!panes.plan} inline={panes.wide === "plan"}>
          {rows.map(({ recipe, crates }) => (
            <div className="factory-plan-row" key={recipe.id}>
              <ItemIcon sources={[assetUrl(recipe.icon_url)]} size={56} label={rname(recipe)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-white">{rname(recipe)}</span>
                <span className="hud-label mt-0.5 block truncate text-muted">
                  {facility === "mpf"
                    ? planning
                      ? t("tools.mpfOrders", { orders: mpfOrders(crates, queueLimit(recipe, facility)).join(" + ") })
                      : t("tools.mpfLimit", { min: MPF_MIN_CRATES, max: queueLimit(recipe, facility) })
                    : planning
                      ? t("tools.noLimit")
                      : t("tools.limit", { n: queueLimit(recipe, facility) })}
                </span>
              </span>
              <QuantityStepper value={crates} unit={t("unit.crate")} label={rname(recipe)} onChange={(n) => setQuantity(recipe, n)} />
              <button type="button" className="btn btn-danger px-2 py-1" data-guide="tool-remove" onClick={() => setQuantity(recipe, 0)} title={t("tools.removeFromQueue")} aria-label={t("tools.removeFromQueue")}>✕</button>
            </div>
          ))}
        </ResourceSummaryPanel>
      </div>
    </div>
  );
};
