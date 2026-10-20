"use client";

import * as React from "react";
import { RAW, buildChain, chainTotals, facilityData, type ChainChoice, type ChainNode, type Recipe } from "@/entities/recipe";
import { ItemIcon, PagedMore, QuantityStepper, assetUrl, buildTxt, copyText, formatDuration, timeUnits, UiGlyph, useI18n, useNotify, usePaged, type MessageKey } from "@/shared";
import { ResourceSummaryPanel, toolDoc, type ToolReport } from "@/features/tools/ui/ResourceSummaryPanel";

const FACTIONS: { key: string; label: MessageKey }[] = [
  { key: "all", label: "codes.allFactions" },
  { key: "neutral", label: "codes.faction.neutral" },
  { key: "colonial", label: "codes.faction.colonial" },
  { key: "warden", label: "codes.faction.warden" },
];

interface PlanRow {
  key: string;
  recipeId: string;
  amount: number;
}

/** Количество с единицей, если это не штуки: «125 L», «5 MW». */
const withUnit = (n: number, unit: string | null) => (unit ? `${fmt(n)} ${unit}` : n);
const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("ru-RU") : n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }));

/** «Постройка • модификация — входы → выход»: подпись рецепта в выборе. */
function recipeLabel(recipe: Recipe): string {
  const d = facilityData(recipe);
  if (!d) return recipe.name;
  const inputs = d.inputs.map((p) => `${p.name} ${fmt(p.amount)}${p.unit ? ` ${p.unit}` : ""}`).join(" + ");
  return `${d.source}${d.module ? ` • ${d.module}` : ""} — ${inputs}${d.vehicle ? ` + ${d.vehicle}` : ""} → ${fmt(recipe.output_quantity)}`;
}

/**
 * «Калькулятор завода»: любой предмет, который производят постройки (Materials Factory,
 * Metalworks, Ammunition, Assembly Stations...), со всеми рецептами и модификациями.
 * Цепочку можно разложить до сырья: для каждого промежуточного предмета выбирается
 * рецепт или «сырьё». Данные — Cargo-таблица Production на foxhole.wiki.gg.
 */
export const FacilityCalculator: React.FC<{ recipes: Recipe[] }> = ({ recipes }) => {
  const notify = useNotify();
  const { t } = useI18n();
  const [faction, setFaction] = React.useState("all");
  const [source, setSource] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [plan, setPlan] = React.useState<PlanRow[]>([]);
  const [choice, setChoice] = React.useState<ChainChoice>({});

  const byId = React.useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const allowed = React.useCallback((r: Recipe) => faction === "all" || r.factions.includes(faction) || r.factions.includes("neutral"), [faction]);
  /** Рецепты по выходному предмету (альтернативы). */
  const byName = React.useMemo(() => {
    const map = new Map<string, Recipe[]>();
    for (const r of recipes) map.set(r.name, [...(map.get(r.name) ?? []), r]);
    return map;
  }, [recipes]);
  const sources = React.useMemo(() => Array.from(new Set(recipes.map((r) => facilityData(r)?.source ?? ""))).filter(Boolean).sort(), [recipes]);

  // карточка — предмет; рецепты под фильтром постройки и фракции
  const cards = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const out: { name: string; recipes: Recipe[] }[] = [];
    for (const [name, list] of byName) {
      const fit = list.filter((r) => allowed(r) && (source === "all" || facilityData(r)?.source === source));
      if (!fit.length) continue;
      if (needle && !`${name} ${fit.map((r) => `${facilityData(r)?.source} ${r.item_class ?? ""}`).join(" ")}`.toLowerCase().includes(needle)) continue;
      out.push({ name, recipes: fit });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [byName, allowed, source, query]);
  const page = usePaged(cards, 60, `${query}|${source}|${faction}`);

  const add = (card: { name: string; recipes: Recipe[] }) => {
    const recipe = card.recipes[0];
    setPlan((prev) => {
      const found = prev.find((p) => byId.get(p.recipeId)?.name === card.name);
      if (found) return prev.map((p) => (p === found ? { ...p, amount: p.amount + (byId.get(p.recipeId)?.output_quantity ?? 1) } : p));
      return [...prev, { key: `${card.name}-${Date.now()}`, recipeId: recipe.id, amount: recipe.output_quantity }];
    });
  };
  const update = (key: string, patch: Partial<PlanRow>) =>
    setPlan((prev) => prev.flatMap((p) => (p.key !== key ? [p] : patch.amount === 0 ? [] : [{ ...p, ...patch }])));

  const chains = React.useMemo(() => {
    const out = new Map<string, ChainNode>();
    for (const row of plan) {
      const recipe = byId.get(row.recipeId);
      if (recipe) out.set(row.key, buildChain({ name: recipe.name, unit: facilityData(recipe)?.output_unit ?? null, icon_url: recipe.icon_url }, row.amount, recipe, choice, byId));
    }
    return out;
  }, [plan, byId, choice]);
  const roots = React.useMemo(() => [...chains.values()], [chains]);
  const totals = React.useMemo(() => chainTotals(roots), [roots]);

  const unitOf = React.useCallback((unit: string | null) => unit ?? t("unit.unit"), [t]);
  const report = React.useMemo<ToolReport>(() => {
    const longest = Math.max(0, ...totals.seconds.values());
    return {
      toolName: t("tools.facility"),
      subtitle: "Facilities • foxhole.wiki.gg",
      fileBase: "SINDARIS_facility",
      items: roots.map((n) => ({ name: n.name, quantity: fmt(n.amount), unit: unitOf(n.unit), icon: assetUrl(n.icon_url), note: n.recipe ? recipeLabel(n.recipe) : undefined })),
      resources: [...totals.raw].map(([name, v]) => ({ name, quantity: withUnit(Math.ceil(v.amount * 10) / 10, v.unit), unit: unitOf(v.unit), icon: assetUrl(v.icon_url) })),
      stats: [
        { name: t("facility.runs"), quantity: totals.runs, unit: "" },
        { name: t("tools.time"), quantity: formatDuration(longest, timeUnits(t)), unit: "" },
        ...[...totals.seconds].map(([src, sec]) => ({ name: `⏱ ${src}`, quantity: formatDuration(sec, timeUnits(t)), unit: "" })),
        ...(totals.peakMw ? [{ name: t("facility.peakPower"), quantity: withUnit(totals.peakMw, "MW"), unit: "MW" }, { name: t("facility.energy"), quantity: withUnit(Math.round(totals.energyMwh * 100) / 100, "MWh"), unit: "MWh" }] : []),
        ...[...totals.byproducts].map(([name, v]) => ({ name: t("facility.byproduct", { name }), quantity: withUnit(v.amount, v.unit), unit: unitOf(v.unit) })),
      ],
    };
  }, [roots, totals, t, unitOf]);

  return (
    <div className="tab-fade factory-page pb-24 lg:pb-0">
      <section className="panel panel-corners factory-topbar">
        <div className="flex min-w-0 items-center gap-3">
          <UiGlyph icon="facility" size={40} />
          <div className="min-w-0">
            <div className="hud-label text-muted">FACILITY PLANNER • FOXHOLE</div>
            <h2 className="panel-title mt-1 text-[1.1rem] md:text-[1.45rem]">⚙ {t("tools.facility")}</h2>
            <p className="mt-1 text-sm text-white/65">{t("facility.hint")}</p>
          </div>
        </div>
        <div className="factory-controls">
          <button className="btn btn-primary" onClick={() => void copyText(buildTxt(toolDoc(report, t))).then((ok) => notify(ok ? { title: "FACILITY PLAN", message: t("tools.planCopied"), tone: "success" } : { title: t("export.clipboardTitle"), message: t("tools.copyFailed"), tone: "warning" }))}>
            ⧉ {t("tools.sharePlan")}
          </button>
        </div>
      </section>

      <div className="grid min-h-0 flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
        <section className="panel panel-corners factory-catalog">
          <div className="factory-filters">
            <input className="field h-11 flex-1" data-guide="facility-search" placeholder={t("facility.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="field h-11 w-full md:w-44" value={faction} onChange={(e) => setFaction(e.target.value)}>
              {FACTIONS.map((f) => (
                <option key={f.key} value={f.key}>{t(f.label)}</option>
              ))}
            </select>
          </div>
          <div data-guide="facility-sources" className="factory-categories scroll-area">
            <button className={`chip ${source === "all" ? "is-active" : ""}`} onClick={() => setSource("all")}>{t("facility.allSources")}</button>
            {sources.map((s) => (
              <button key={s} className={`chip ${source === s ? "is-active" : ""}`} onClick={() => setSource(s)}>{s}</button>
            ))}
          </div>
          <div className="factory-count hud-label">{t("codes.shown")}: {cards.length} / {byName.size}</div>

          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2.5">
            {page.items.map((card) => {
              const queued = plan.find((p) => byId.get(p.recipeId)?.name === card.name);
              const first = card.recipes[0];
              return (
                <button key={card.name} type="button" className={`factory-item-card relative min-h-[13rem] flex-col justify-start gap-2 p-3 text-center ${queued ? "border-accent" : ""}`} onClick={() => add(card)}>
                  <span className="factory-add absolute top-2 right-2">＋</span>
                  {queued ? <span className="absolute top-2 left-2 rounded-sm border border-[#16a34a] bg-[#1e291b] px-1.5 py-0.5 font-mono text-[0.65rem] text-accent">{fmt(queued.amount)}</span> : null}
                  <ItemIcon sources={[assetUrl(first.icon_url)]} size={72} label={card.name} className="mt-3" />
                  <strong className="line-clamp-2 min-h-[2.5em] w-full text-[0.82rem] leading-tight text-white">{card.name}</strong>
                  <small className="block w-full truncate text-[0.7rem] text-muted">{facilityData(first)?.source}</small>
                  {card.recipes.length > 1 ? (
                    <span className="mt-auto rounded-sm border border-amber-300/40 bg-black/30 px-1.5 py-0.5 font-mono text-[0.62rem] text-amber-200">{t("facility.recipes", { n: card.recipes.length })}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <PagedMore page={page} />
        </section>

        <ResourceSummaryPanel report={report} title={t("facility.queue")} emptyHint={t("facility.queueHint")} onClear={() => setPlan([])}>
          {plan.map((row) => {
            const recipe = byId.get(row.recipeId);
            if (!recipe) return null;
            const options = (byName.get(recipe.name) ?? []).filter((r) => allowed(r) || r.id === recipe.id);
            const root = chains.get(row.key);
            return (
              <div key={row.key} className="facility-plan">
                <div className="factory-plan-row">
                  <ItemIcon sources={[assetUrl(recipe.icon_url)]} size={48} label={recipe.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{recipe.name}</span>
                    <span className="hud-label mt-0.5 block truncate text-muted">{t("facility.perRun", { n: fmt(recipe.output_quantity) })}</span>
                  </span>
                  <QuantityStepper value={row.amount} unit={unitOf(facilityData(recipe)?.output_unit ?? null)} label={recipe.name} onChange={(n) => update(row.key, { amount: Math.max(0, n) })} />
                  <button type="button" className="btn btn-danger px-2 py-1" onClick={() => update(row.key, { amount: 0 })} title={t("tools.removeFromQueue")} aria-label={t("tools.removeFromQueue")}>✕</button>
                </div>
                <label className="facility-recipe">
                  <span className="hud-label text-muted">{t("facility.recipe")}</span>
                  <select data-guide="facility-recipe" className="field w-full py-1 text-xs" value={recipe.id} onChange={(e) => update(row.key, { recipeId: e.target.value })}>
                    {options.map((r) => (
                      <option key={r.id} value={r.id}>{recipeLabel(r)}</option>
                    ))}
                  </select>
                </label>
                {root ? (
                  <details className="facility-chain" open>
                    <summary className="hud-label text-accent">{t("facility.chain")}</summary>
                    <ul>
                      {root.children.map((child, i) => (
                        <ChainItem key={`${child.name}-${i}`} node={child} byName={byName} allowed={allowed} choice={choice} setChoice={setChoice} unitOf={unitOf} />
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            );
          })}
        </ResourceSummaryPanel>
      </div>
    </div>
  );
};

/** Узел цепочки: количество и выбор — сырьё или один из рецептов (выбор общий для предмета). */
const ChainItem: React.FC<{
  node: ChainNode;
  byName: Map<string, Recipe[]>;
  allowed: (r: Recipe) => boolean;
  choice: ChainChoice;
  setChoice: React.Dispatch<React.SetStateAction<ChainChoice>>;
  unitOf: (unit: string | null) => string;
}> = ({ node, byName, allowed, choice, setChoice, unitOf }) => {
  const { t } = useI18n();
  const options = (byName.get(node.name) ?? []).filter(allowed);
  const value = node.recipe?.id ?? choice[node.name] ?? RAW;
  return (
    <li>
      <div className="facility-node">
        <ItemIcon sources={[assetUrl(node.icon_url)]} size={24} label={node.name} />
        <span className="min-w-0 flex-1 truncate text-[0.8rem] text-white">{node.name}</span>
        <span className="badge-count shrink-0">{fmt(Math.ceil(node.amount * 10) / 10)} {unitOf(node.unit)}</span>
      </div>
      {node.cycle ? <span className="hud-label pl-8 text-warn">↻ {t("facility.cycle")}</span> : null}
      {options.length > 0 && !node.cycle ? (
        <select className="field facility-node-select" value={value} onChange={(e) => setChoice((prev) => ({ ...prev, [node.name]: e.target.value }))}>
          <option value={RAW}>{t("facility.raw")}</option>
          {options.map((r) => (
            <option key={r.id} value={r.id}>{recipeLabel(r)}</option>
          ))}
        </select>
      ) : null}
      {node.recipe && node.children.length ? (
        <ul>
          {node.children.map((child, i) => (
            <ChainItem key={`${child.name}-${i}`} node={child} byName={byName} allowed={allowed} choice={choice} setChoice={setChoice} unitOf={unitOf} />
          ))}
        </ul>
      ) : null}
    </li>
  );
};
