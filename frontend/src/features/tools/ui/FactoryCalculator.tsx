"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import type { Recipe } from "@/entities/recipe";
import { ItemIcon, QuantityStepper, assetUrl, buildTxt, copyText, formatDuration, uiIcon, useNotify } from "@/shared";
import { ResourceSummaryPanel, toolDoc, type ToolReport } from "@/features/tools/ui/ResourceSummaryPanel";

type Facility = "factory" | "mpf";
const FACTIONS = [
  { key: "all", label: "Все фракции" },
  { key: "neutral", label: "Нейтральные" },
  { key: "colonial", label: "Колонисты" },
  { key: "warden", label: "Варден" },
];

/** MPF: каждый следующий ящик партии дешевле на 10% (максимум −50%). */
function discountSum(base: number, crates: number, facility: Facility): number {
  if (facility !== "mpf") return base * crates;
  let total = 0;
  for (let i = 1; i <= crates; i += 1) total += Math.floor(base * (1 - Math.min(0.5, i * 0.1)));
  return total;
}

/** Игровой лимит очереди (режим PRODUCTION). */
function queueLimit(recipe: Recipe, facility: Facility): number {
  if (facility === "mpf") return 9;
  return recipe.category === "vehicles" || recipe.category === "shipables" ? 5 : 4;
}

export const FactoryCalculator: React.FC<{ facility: Facility; recipes: Recipe[] }> = ({ facility, recipes }) => {
  const notify = useNotify();
  const { label, labelIcon } = useContent();
  const [planning, setPlanning] = React.useState(false);
  const [faction, setFaction] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [plan, setPlan] = React.useState<Record<string, number>>({});

  const categories = React.useMemo(() => Array.from(new Set(recipes.map((r) => r.category))), [recipes]);
  const byId = React.useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return recipes.filter(
      (r) =>
        (faction === "all" || r.factions.includes(faction)) &&
        (planning || r.facilities.includes(facility)) &&
        (category === "all" || r.category === category) &&
        (!needle || `${r.name} ${r.item_class ?? ""} ${r.description ?? ""}`.toLowerCase().includes(needle)),
    );
  }, [recipes, faction, planning, facility, category, query]);

  const rows = React.useMemo(
    () => Object.entries(plan).flatMap(([id, crates]) => (byId.get(id) && crates > 0 ? [{ recipe: byId.get(id)!, crates }] : [])),
    [plan, byId],
  );

  const report = React.useMemo<ToolReport>(() => {
    const materials: Record<string, number> = {};
    let crates = 0;
    for (const { recipe, crates: qty } of rows) {
      crates += qty;
      for (const [key, value] of Object.entries(recipe.cost)) materials[key] = (materials[key] ?? 0) + discountSum(Number(value) || 0, qty, facility);
    }
    const isFactory = facility === "factory";
    return {
      toolName: isFactory ? "Калькулятор фабрики" : "MPF — Mass Production Factory",
      subtitle: `${isFactory ? "Factory" : "Mass Production Factory"} • ${planning ? "PLANNING (без лимитов)" : "PRODUCTION (игровые лимиты)"}`,
      fileBase: isFactory ? "SINDARIS_фабрика" : "SINDARIS_MPF",
      items: rows.map(({ recipe, crates: q }) => ({ name: recipe.name, quantity: q, unit: "ящ.", icon: assetUrl(recipe.icon_url) })),
      resources: Object.entries(materials).map(([key, value]) => ({ name: label("material", key), quantity: Math.round(value), unit: "шт.", icon: labelIcon("material", key) })),
      stats: [
        { name: "Ящики", quantity: crates, unit: "ящ." },
        { name: "Время", quantity: formatDuration(crates * 60), unit: "" },
      ],
    };
  }, [rows, facility, planning, label, labelIcon]);

  /** requested — число или функция от текущего количества (клик ＋ по карточке). */
  const setQuantity = (recipe: Recipe, requested: number | ((current: number) => number)) => {
    const limit = queueLimit(recipe, facility);
    setPlan((prev) => {
      const wanted = Math.max(0, Math.floor(typeof requested === "function" ? requested(prev[recipe.id] ?? 0) : requested));
      const next = !planning && wanted > limit ? limit : wanted;
      if (next !== wanted) {
        window.setTimeout(() => notify({ title: "ЛИМИТ ОЧЕРЕДИ", message: `${recipe.name}: максимум ${limit} ящиков в режиме Production. Переключитесь на Planning для свободного расчёта.`, tone: "warning" }));
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={uiIcon(facility === "factory" ? "business" : "conveyor-belt")} alt="" className="ui-icon h-10 w-10 object-contain" />
          <div className="min-w-0">
            <div className="hud-label text-muted">PRODUCTION PLANNER • FOXHOLE</div>
            <h2 className="panel-title mt-1 text-[1.1rem] md:text-[1.45rem]">⚙ {facility === "factory" ? "Калькулятор фабрики" : "MPF — Mass Production Factory"}</h2>
            <p className="mt-1 text-sm text-white/65">
              {facility === "factory"
                ? "Соберите производственную очередь и рассчитайте ресурсы, ящики и ориентировочное время."
                : "Очередь MPF: каждый следующий ящик в партии дешевле на 10% (максимум −50%), лимит — 9 ящиков."}
            </p>
          </div>
        </div>
        <div className="factory-controls">
          <button className={`btn ${planning ? "btn-warn btn-active" : ""}`} onClick={() => setPlanning((v) => !v)}>{planning ? "PLANNING" : "PRODUCTION"}</button>
          <button className="btn btn-primary" onClick={() => void copyText(buildTxt(toolDoc(report))).then((ok) => notify(ok ? { title: "FACTORY PLAN", message: "План производства скопирован в буфер.", tone: "success" } : { title: "БУФЕР", message: "Не удалось скопировать план.", tone: "warning" }))}>
            ⧉ Поделиться планом
          </button>
        </div>
      </section>

      <div className="grid min-h-0 flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
        <section className="panel panel-corners factory-catalog">
          <div className="factory-filters">
            <input className="field h-11 flex-1" placeholder="Поиск предмета, класса или описания..." value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="field h-11 w-full md:w-44" value={faction} onChange={(e) => setFaction(e.target.value)}>
              {FACTIONS.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>
          <div className="factory-categories scroll-area">
            <button className={`chip ${category === "all" ? "is-active" : ""}`} onClick={() => setCategory("all")}>Все</button>
            {categories.map((c) => (
              <button key={c} className={`chip ${category === c ? "is-active" : ""}`} onClick={() => setCategory(c)}>{label("factory_category", c)}</button>
            ))}
          </div>
          <div className="factory-count hud-label">Показано: {visible.length} / {recipes.length}</div>

          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2.5">
            {visible.map((recipe) => {
              const queued = plan[recipe.id] ?? 0;
              return (
                <button key={recipe.id} type="button" className={`factory-item-card relative min-h-[14rem] flex-col justify-start gap-2 p-3 text-center ${queued ? "border-accent" : ""}`} onClick={() => setQuantity(recipe, (n) => n + 1)} title={recipe.description ?? undefined}>
                  <span className="factory-add absolute top-2 right-2">＋</span>
                  {queued ? <span className="absolute top-2 left-2 rounded-sm border border-[#16a34a] bg-[#1e291b] px-1.5 py-0.5 font-mono text-[0.65rem] text-accent">{queued} ящ.</span> : null}
                  <ItemIcon sources={[assetUrl(recipe.icon_url)]} size={88} label={recipe.name} className="mt-3" />
                  <strong className="line-clamp-2 min-h-[2.5em] w-full text-[0.82rem] leading-tight text-white">{recipe.name}</strong>
                  <small className="block w-full truncate text-[0.7rem] text-muted">{recipe.item_class ?? label("factory_category", recipe.category)} • x{recipe.output_quantity}</small>
                  <span className="mt-auto flex flex-wrap justify-center gap-1">
                    {Object.entries(recipe.cost).map(([key, value]) => (
                      <span key={key} className="rounded-sm border border-white/10 bg-black/30 px-1.5 py-0.5 font-mono text-[0.62rem] text-white/80">{label("material", key)} {value}</span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <ResourceSummaryPanel report={report} title="Производственная очередь" emptyHint="Нажимайте ＋ на карточках, чтобы собрать очередь." onClear={() => setPlan({})}>
          {rows.map(({ recipe, crates }) => (
            <div className="factory-plan-row" key={recipe.id}>
              <ItemIcon sources={[assetUrl(recipe.icon_url)]} size={56} label={recipe.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-white">{recipe.name}</span>
                <span className="hud-label mt-0.5 block truncate text-muted">{planning ? "без лимита" : `лимит ${queueLimit(recipe, facility)} ящ.`}</span>
              </span>
              <QuantityStepper value={crates} unit="ящ." label={recipe.name} onChange={(n) => setQuantity(recipe, n)} />
            </div>
          ))}
        </ResourceSummaryPanel>
      </div>
    </div>
  );
};
