"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import type { RefineryData, Recipe } from "@/entities/recipe";
import { ItemIcon, QuantityStepper, assetUrl, buildTxt, copyText, formatDuration, useNotify } from "@/shared";
import { ResourceSummaryPanel, toolDoc, type ToolReport } from "@/features/tools/ui/ResourceSummaryPanel";

type InputUnit = "crate" | "unit";
interface PlanEntry {
  quantity: number;
  unit: InputUnit;
}

const TOOL_NAME = "Калькулятор молотка (Refinery)";
const data = (r: Recipe) => r.data as unknown as RefineryData;
const unitsFor = (r: Recipe, e: PlanEntry) => (e.unit === "crate" && data(r).crate_size > 1 ? e.quantity * data(r).crate_size : e.quantity);
const rawFor = (r: Recipe, units: number) => units * data(r).input_per_unit;
const secondsFor = (r: Recipe, units: number) => units * data(r).seconds_per_unit;

/** Сырьё → продукт: сколько сырья, ящиков и времени нужно Refinery (рецепты с сервера). */
export const RefineryCalculator: React.FC<{ recipes: Recipe[] }> = ({ recipes }) => {
  const notify = useNotify();
  const { label, labelIcon, list } = useContent();
  const [group, setGroup] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [plan, setPlan] = React.useState<Record<string, PlanEntry>>({});

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return recipes.filter((r) => {
      const text = `${r.name} ${r.name_en ?? ""} ${r.item_class ?? ""} ${label("material", data(r).input)}`.toLowerCase();
      return (group === "all" || r.category === group) && (!needle || text.includes(needle));
    });
  }, [recipes, group, query, label]);

  const rows = React.useMemo(() => recipes.flatMap((r) => (plan[r.id]?.quantity ? [{ recipe: r, entry: plan[r.id], units: unitsFor(r, plan[r.id]) }] : [])), [recipes, plan]);

  const report = React.useMemo<ToolReport>(() => {
    const resources: Record<string, number> = {};
    let seconds = 0;
    let outputCrates = 0;
    for (const { recipe, units } of rows) {
      const d = data(recipe);
      resources[d.input] = (resources[d.input] ?? 0) + rawFor(recipe, units);
      // все рецепты Refinery идут параллельно — ожидание = самый долгий рецепт
      seconds = Math.max(seconds, secondsFor(recipe, units));
      if (d.crate_size > 1) outputCrates += Math.ceil(units / d.crate_size);
    }
    const order = list("material").map((m) => m.key);
    return {
      toolName: TOOL_NAME,
      subtitle: "Refinery • сырьё → материалы • рецепты идут параллельно",
      fileBase: "SINDARIS_молоток",
      items: rows.map(({ recipe, entry, units }) => ({
        name: `${recipe.name} (${recipe.item_class})`,
        quantity: entry.quantity,
        unit: entry.unit === "crate" ? "ящ." : data(recipe).unit_label,
        note: entry.unit === "crate" ? `= ${units} ${data(recipe).unit_label}` : undefined,
        icon: assetUrl(recipe.icon_url),
      })),
      resources: Object.entries(resources)
        .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
        .map(([key, amount]) => ({ name: label("material", key), quantity: amount, unit: "шт.", icon: labelIcon("material", key) })),
      stats: [
        { name: "Время", quantity: formatDuration(seconds), unit: "" },
        { name: "Ящики продукции", quantity: outputCrates, unit: "ящ." },
      ],
    };
  }, [rows, label, labelIcon, list]);

  const add = (r: Recipe) => setPlan((prev) => ({ ...prev, [r.id]: prev[r.id] ? { ...prev[r.id], quantity: prev[r.id].quantity + 1 } : { quantity: 1, unit: data(r).crate_size > 1 ? "crate" : "unit" } }));
  const setQuantity = (r: Recipe, q: number) =>
    setPlan((prev) => {
      const copy = { ...prev };
      if (q > 0 && copy[r.id]) copy[r.id] = { ...copy[r.id], quantity: Math.floor(q) };
      else delete copy[r.id];
      return copy;
    });
  const setUnit = (r: Recipe, unit: InputUnit) =>
    setPlan((prev) => {
      const e = prev[r.id];
      if (!e || e.unit === unit) return prev;
      const size = data(r).crate_size;
      const quantity = unit === "unit" ? e.quantity * size : Math.max(1, Math.ceil(e.quantity / size));
      return { ...prev, [r.id]: { unit, quantity } };
    });

  const groups = list<{ label: string }>("refinery_group");

  return (
    <div className="tab-fade factory-page pb-24 lg:pb-0">
      <section className="panel panel-corners factory-topbar">
        <div className="flex min-w-0 items-center gap-3">
          <ItemIcon sources={[labelIcon("material", "salvage")]} size={44} label="Refinery" />
          <div className="min-w-0">
            <div className="hud-label text-muted">REFINERY PLANNER • FOXHOLE</div>
            <h2 className="panel-title mt-1 text-[1.1rem] md:text-[1.45rem]">🔨 {TOOL_NAME}</h2>
            <p className="mt-1 text-sm text-white/65">Выберите продукты переработки и укажите количество — калькулятор посчитает сырьё, ящики и время работы Refinery.</p>
          </div>
        </div>
        <div className="factory-controls">
          <button className="btn btn-primary" onClick={() => void copyText(buildTxt(toolDoc(report))).then((ok) => notify(ok ? { title: "REFINERY", message: "Расчёт переработки скопирован в буфер.", tone: "success" } : { title: "БУФЕР", message: "Не удалось скопировать расчёт.", tone: "warning" }))}>
            ⧉ Поделиться расчётом
          </button>
        </div>
      </section>

      <div className="grid min-h-0 flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
        <section className="panel panel-corners factory-catalog">
          <div className="factory-filters">
            <input className="field h-11 flex-1" placeholder="Поиск продукта или сырья..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="factory-categories scroll-area">
            <button className={`chip ${group === "all" ? "is-active" : ""}`} onClick={() => setGroup("all")}>Все</button>
            {groups.map((g) => (
              <button key={g.key} className={`chip ${group === g.key ? "is-active" : ""}`} onClick={() => setGroup(g.key)}>{g.payload.label}</button>
            ))}
          </div>
          <div className="factory-count hud-label">Показано: {visible.length} / {recipes.length} • данные: foxhole.wiki.gg</div>

          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2.5">
            {visible.map((recipe) => {
              const d = data(recipe);
              const queued = plan[recipe.id];
              return (
                <button key={recipe.id} type="button" className={`factory-item-card relative min-h-[14.5rem] flex-col justify-start gap-2 p-3 text-center ${queued ? "border-accent" : ""}`} onClick={() => add(recipe)} title={`${recipe.name_en}: ${d.input_per_unit} × ${label("material", d.input)} → 1`}>
                  <span className="factory-add absolute top-2 right-2">＋</span>
                  {queued ? <span className="absolute top-2 left-2 rounded-sm border border-[#16a34a] bg-[#1e291b] px-1.5 py-0.5 font-mono text-[0.65rem] text-accent">{queued.quantity} {queued.unit === "crate" ? "ящ." : d.unit_label}</span> : null}
                  <ItemIcon sources={[assetUrl(recipe.icon_url)]} size={88} label={recipe.name} className="mt-3" />
                  <strong className="line-clamp-2 min-h-[2.5em] w-full text-[0.82rem] leading-tight text-white">{recipe.name}</strong>
                  <small className="hud-label text-accent">{recipe.item_class} • {label("refinery_group", recipe.category)}</small>
                  <span className="mt-auto flex items-center justify-center gap-1.5 rounded-sm border border-white/10 bg-black/30 px-2 py-1 font-mono text-[0.68rem] text-white/85">
                    <ItemIcon sources={[labelIcon("material", d.input)]} size={22} label={label("material", d.input)} />
                    {d.input_per_unit} × {label("material", d.input)} → 1
                  </span>
                  <small className="text-[0.66rem] text-muted">
                    {d.seconds_per_unit.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} с / {d.unit_label} • {d.crate_size > 1 ? `ящик: ${d.crate_size}` : recipe.description ?? "без ящиков"}
                  </small>
                </button>
              );
            })}
          </div>
        </section>

        <ResourceSummaryPanel report={report} title="Очередь переработки" emptyHint="Нажимайте ＋ на карточках, чтобы собрать заказ для Refinery." onClear={() => setPlan({})}>
          {rows.map(({ recipe, entry, units }) => {
            const d = data(recipe);
            return (
              <div className="factory-plan-row flex-wrap" key={recipe.id}>
                <ItemIcon sources={[assetUrl(recipe.icon_url)]} size={56} label={recipe.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">{recipe.name}</span>
                  <span className="hud-label mt-0.5 block truncate text-muted">
                    = {units.toLocaleString("ru-RU")} {d.unit_label} • {rawFor(recipe, units).toLocaleString("ru-RU")} {label("material", d.input)} • {formatDuration(secondsFor(recipe, units))}
                  </span>
                  {units > d.personal_limit ? <span className="hud-label mt-0.5 block text-warn">⚠ Больше личного слота ({d.personal_limit.toLocaleString("ru-RU")}); отряд — {(d.personal_limit * 2).toLocaleString("ru-RU")}</span> : null}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <QuantityStepper value={entry.quantity} unit={entry.unit === "crate" ? "ящ." : d.unit_label} label={recipe.name} onChange={(n) => setQuantity(recipe, n)} />
                  {d.crate_size > 1 ? (
                    <div className="flex overflow-hidden rounded border border-white/10" role="group" aria-label={`Единицы ввода: ${recipe.name}`}>
                      <button type="button" className={`btn rounded-none border-0 px-1.5 py-1 text-[0.6rem] ${entry.unit === "crate" ? "btn-active" : ""}`} onClick={() => setUnit(recipe, "crate")} title={`Ящики по ${d.crate_size}`}>ЯЩ</button>
                      <button type="button" className={`btn rounded-none border-0 px-1.5 py-1 text-[0.6rem] ${entry.unit === "unit" ? "btn-active" : ""}`} onClick={() => setUnit(recipe, "unit")} title="Поштучно">ШТ</button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </ResourceSummaryPanel>
      </div>
    </div>
  );
};
