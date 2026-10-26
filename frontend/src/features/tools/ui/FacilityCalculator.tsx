"use client";

import * as React from "react";
import { RAW, buildChain, chainTotals, facilityData, powerPlan, type ChainChoice, type ChainNode, type Recipe } from "@/entities/recipe";
import { codeSynonyms } from "@/entities/item";
import { FilterCards, ItemIcon, PagedMore, QuantityStepper, assetUrl, buildTxt, copyText, formatDuration, matchesWords, timeUnits, UiGlyph, useI18n, useNotify, usePaged, Icon, SearchField } from "@/shared";
import { ToolHeader } from "@/features/tools/ui/ToolHeader";
import { SendOrderDialog } from "@/entities/report/ui/SendOrderDialog";
import { ResourceSummaryPanel, toolDoc, type ToolReport } from "@/features/tools/ui/ResourceSummaryPanel";
import { FACTION_FILTERS, PaneToggles, paneCardsClass, paneGridClass, usePanes } from "@/features/tools/ui/ToolPanes";


/** Название предмета на языке интерфейса: цепочка хранит английские имена, показываем русские. */
/** Категория «Здания»: data.source у построек, которые клан возводит сам. */
const BUILDINGS = "Buildings";
const DisplayName = React.createContext<(name: string) => string>((name) => name);
const useDisplayName = () => React.useContext(DisplayName);

interface PlanRow {
  key: string;
  recipeId: string;
  amount: number;
}

/** Количество с единицей, если это не штуки: «125 L», «5 MW». */
const withUnit = (n: number, unit: string | null) => (unit ? `${fmt(n)} ${unit}` : n);
const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("ru-RU") : n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }));

/**
 * «Калькулятор завода»: любой предмет, который производят постройки (Materials Factory,
 * Metalworks, Ammunition, Assembly Stations...), со всеми рецептами и модификациями.
 * Цепочку можно разложить до сырья: для каждого промежуточного предмета выбирается
 * рецепт или «сырьё». Данные — Cargo-таблица Production на foxhole.wiki.gg.
 */
export const FacilityCalculator: React.FC<{ recipes: Recipe[]; canSend?: boolean; onSent?: () => void }> = ({ recipes, canSend, onSent }) => {
  const notify = useNotify();
  const { t, locale } = useI18n();
  const [faction, setFaction] = React.useState("all");
  // выбранная постройка: null — ничего не выбрано (предметы видны только при поиске)
  const [source, setSource] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [plan, setPlan] = React.useState<PlanRow[]>([]);
  const [choice, setChoice] = React.useState<ChainChoice>({});
  const panes = usePanes();
  const [sendOpen, setSendOpen] = React.useState(false);
  // сколько зданий каждой постройки есть у игрока (по умолчанию 1)
  const [counts, setCounts] = React.useState<Record<string, number>>({});

  const byId = React.useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  // английское имя -> русское (выход рецепта и все входы/побочные продукты)
  const dn = React.useMemo(() => {
    if (locale !== "ru") return (name: string) => name;
    const ru = new Map<string, string>();
    for (const r of recipes) {
      const d = facilityData(r);
      if (!d) continue;
      if (d.name_ru) ru.set(r.name, d.name_ru);
      if (d.source_ru) ru.set(d.source, d.source_ru);
      for (const p of [...d.inputs, ...d.byproducts]) if (p.name_ru) ru.set(p.name, p.name_ru);
    }
    return (name: string) => ru.get(name) ?? name;
  }, [recipes, locale]);
  const allowed = React.useCallback((r: Recipe) => faction === "all" || r.factions.includes(faction) || r.factions.includes("neutral"), [faction]);
  /** Рецепты по выходному предмету (альтернативы). */
  const byName = React.useMemo(() => {
    const map = new Map<string, Recipe[]>();
    for (const r of recipes) map.set(r.name, [...(map.get(r.name) ?? []), r]);
    return map;
  }, [recipes]);
  /** Постройки-карточки: иконка с вики и число предметов (под фильтром фракции). */
  const sources = React.useMemo(() => {
    const map = new Map<string, { icon: string | null; items: Set<string> }>();
    for (const r of recipes) {
      const d = facilityData(r);
      if (!d || !allowed(r)) continue;
      const entry = map.get(d.source) ?? { icon: d.source_icon ?? null, items: new Set<string>() };
      entry.items.add(r.name);
      map.set(d.source, entry);
    }
    // «Здания» (постройки, которые клан строит сам) — первой карточкой, остальные по алфавиту
    const rank = (name: string) => (name === BUILDINGS ? 0 : 1);
    return [...map].map(([name, v]) => ({ name, icon: v.icon, count: v.items.size })).sort((a, b) => rank(a.name) - rank(b.name) || dn(a.name).localeCompare(dn(b.name)));
  }, [recipes, allowed, dn]);
  const totalItems = React.useMemo(() => new Set(recipes.filter(allowed).map((r) => r.name)).size, [recipes, allowed]);

  // карточка — предмет; рецепты под фильтром постройки и фракции
  const cards = React.useMemo(() => {
    const needle = query.trim();
    const out: { name: string; recipes: Recipe[] }[] = [];
    for (const [name, list] of byName) {
      const fit = list.filter((r) => allowed(r) && (!source || source === "all" || facilityData(r)?.source === source));
      if (!fit.length) continue;
      const hay = `${name} ${dn(name)} ${fit.map((r) => `${facilityData(r)?.source} ${r.item_class ?? ""} ${r.item_code ?? ""} ${codeSynonyms(r.item_code).join(" ")}`).join(" ")}`;
      if (needle && !matchesWords(hay, needle)) continue;
      out.push({ name, recipes: fit });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [byName, allowed, source, query, dn]);
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
  const power = React.useMemo(() => powerPlan(totals, counts), [totals, counts]);
  /** Постройки, где делаются выбранные предметы (все рецепты), и постройки звеньев цепочки. */
  const buildings = React.useMemo(() => {
    const map = new Map<string, { icon: string | null; items: Set<string>; used: boolean }>();
    const note = (source: string, icon: string | null | undefined, item: string, used: boolean) => {
      // «Здания» строятся на месте — это не производственная постройка с мощностью и временем
      if (source === BUILDINGS) return;
      const entry = map.get(source) ?? { icon: icon ?? null, items: new Set<string>(), used: false };
      entry.items.add(item);
      entry.used ||= used;
      entry.icon ??= icon ?? null;
      map.set(source, entry);
    };
    const walk = (node: ChainNode) => {
      const d = node.recipe ? facilityData(node.recipe) : null;
      if (d) note(d.source, d.source_icon, node.name, true);
      node.children.forEach(walk);
    };
    for (const root of roots) {
      for (const r of (byName.get(root.name) ?? []).filter(allowed)) {
        const d = facilityData(r);
        if (d) note(d.source, d.source_icon, root.name, false);
      }
      walk(root);
    }
    return [...map]
      .map(([source, v]) => ({ source, icon: v.icon, items: [...v.items], used: v.used }))
      .sort((a, b) => Number(b.used) - Number(a.used) || a.source.localeCompare(b.source));
  }, [roots, byName, allowed]);

  const unitOf = React.useCallback((unit: string | null) => unit ?? t("unit.unit"), [t]);
  const report = React.useMemo<ToolReport>(() => {
    const mw = (n: number) => `${fmt(Math.round(n * 10) / 10)} MW`;
    return {
      toolName: t("tools.facility"),
      subtitle: "Facilities • foxhole.wiki.gg",
      fileBase: "SINDARIS_facility",
      items: roots.map((n) => ({ name: dn(n.name), quantity: withUnit(n.amount, n.unit), unit: n.unit ? "" : unitOf(null), icon: assetUrl(n.icon_url), note: n.recipe ? facilityData(n.recipe)?.source : undefined })),
      resources: [...totals.raw].map(([name, v]) => ({ name: dn(name), quantity: withUnit(Math.ceil(v.amount * 10) / 10, v.unit), unit: v.unit ? "" : unitOf(null), icon: assetUrl(v.icon_url) })),
      stats: [
        { name: t("facility.runs"), quantity: totals.runs, unit: "" },
        { name: t("tools.time"), quantity: formatDuration(power.seconds, timeUnits(t)), unit: "" },
        ...power.sources.filter((src) => src.source !== BUILDINGS).map((src) => ({ name: `${dn(src.source)} ×${src.buildings}`, quantity: formatDuration(src.seconds, timeUnits(t)), unit: "" })),
        ...[...totals.byproducts].map(([name, v]) => ({ name: t("facility.byproduct", { name: dn(name) }), quantity: withUnit(v.amount, v.unit), unit: v.unit ? "" : unitOf(null), icon: assetUrl(v.icon_url) })),
      ],
      sections: power.peakMw
        ? [
            {
              title: t("power.title"),
              lines: [
                { name: t("power.peak"), quantity: mw(power.peakMw), unit: "", note: t("power.peakNote") },
                { name: t("power.energy"), quantity: `${fmt(Math.round(power.energyMwh * 100) / 100)} MWh`, unit: "" },
                ...power.sources
                  .filter((src) => src.peakMw)
                  .map((src) => ({ name: `${dn(src.source)} ×${src.buildings}`, quantity: mw(src.peakMw), unit: "", icon: assetUrl(src.icon), note: t("power.active", { n: src.active, total: src.buildings }) })),
                ...power.fuels.map((f) => ({
                  name: t(`power.fuel.${f.fuel.key}`),
                  quantity: f.cans,
                  unit: t("power.cans"),
                  icon: assetUrl(f.fuel.icon),
                  note: t("power.fuelNote", { liters: fmt(Math.ceil(f.liters)), can: f.fuel.canLiters, plants: f.plants, plant: f.fuel.plant, mw: f.fuel.mw }),
                })),
              ],
            },
          ]
        : [],
    };
  }, [roots, totals, power, t, unitOf, dn]);

  return (
    <DisplayName.Provider value={dn}>
    <div className="tab-fade factory-page pb-24 lg:pb-0">
      <ToolHeader
        icon={<UiGlyph icon="facility" size={26} />}
        eyebrow={t("eyebrow.facility")}
        title={t("tools.facility")}
        hint={t("facility.hint")}
        actions={
          <>
            <button className="btn h-10" onClick={() => void copyText(buildTxt(toolDoc(report, t))).then((ok) => notify(ok ? { title: t("tools.facility"), message: t("tools.planCopied"), tone: "success" } : { title: t("export.clipboardTitle"), message: t("tools.copyFailed"), tone: "warning" }))}>
              <Icon name="copy" size={16} />
              {t("tools.sharePlan")}
            </button>
            {canSend ? (
              <button className="btn btn-primary h-10" data-guide="facility-send" disabled={!roots.length} onClick={() => setSendOpen(true)}>
                <Icon name="send" size={16} />
                {t("orderSend.button")}
              </button>
            ) : null}
          </>
        }
      />

      <PaneToggles panes={panes} catalogLabel={t("facility.catalogPane")} planLabel={t("facility.queue")} />

      <div className={paneGridClass(panes)} data-wide={panes.wide}>
        <section className={`panel factory-catalog ${panes.catalog ? "" : "hidden"}`}>
          <div className="filter-head">
            <span className="tool-section-label">{t("facility.sources")}</span>
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
            guide="facility-sources"
            label={t("facility.sources")}
            items={[
              { key: "all", label: t("facility.allSources"), glyph: "facility", hint: t("facility.items", { n: totalItems }) },
              ...sources.map((s) => ({ key: s.name, label: dn(s.name), icon: s.icon ? assetUrl(s.icon) : null, glyph: "facility" as const, hint: t("facility.items", { n: s.count }) })),
            ]}
            value={source}
            onChange={setSource}
          />

          <SearchField className="mt-4" data-guide="facility-search" placeholder={t("facility.search")} value={query} onChange={setQuery} />
          {!source && !query.trim() ? (
            <div className="py-8 text-center text-sm text-fg-3">{t("facility.pickSource")}</div>
          ) : (
          <>
          <div className="factory-count text-xs">
            {source && source !== "all" ? `${dn(source)} · ` : ""}{t("codes.shown")}: {cards.length} / {totalItems}
          </div>

          <div className={paneCardsClass(panes)}>
            {page.items.map((card) => {
              const queued = plan.find((p) => byId.get(p.recipeId)?.name === card.name);
              const first = card.recipes[0];
              return (
                <button key={card.name} type="button" className={`factory-item-card tool-item min-h-[13rem] ${queued ? "is-selected" : ""}`} onClick={() => add(card)}>
                  <span className="factory-add absolute top-2.5 right-2.5"><Icon name="plus" size={14} strokeWidth={2.5} /></span>
                  {queued ? <span className="queued-badge absolute top-2.5 left-2.5">{fmt(queued.amount)}</span> : null}
                  <ItemIcon sources={[assetUrl(first.icon_url)]} size={72} label={dn(card.name)} className="mt-3" />
                  <strong className="line-clamp-2 min-h-[2.5em] w-full text-[0.85rem] font-semibold leading-tight text-fg">{dn(card.name)}</strong>
                  <small className="block w-full truncate text-[0.72rem] text-fg-3">{dn(facilityData(first)?.source ?? "")}</small>
                  {card.recipes.length > 1 ? (
                    <span className="cost-chip is-warn mt-auto">{t("facility.recipes", { n: card.recipes.length })}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <PagedMore page={page} />
          </>
          )}
        </section>

        <ResourceSummaryPanel report={report} title={t("facility.queue")} emptyHint={t("facility.queueHint")} onClear={() => setPlan([])} hidden={!panes.plan} inline={panes.wide === "plan"}>
          {buildings.length ? (
            <div className="facility-buildings" data-guide="facility-buildings">
              <div className="text-sm font-semibold">{t("power.buildingsTitle")}</div>
              <p className="mt-0.5 text-xs text-fg-3">{t("power.buildingsHint")}</p>
              <div className="facility-buildings-list">
                {buildings.map((b) => (
                  <div key={b.source} className={`facility-building ${b.used ? "is-used" : ""}`}>
                    <ItemIcon sources={[assetUrl(b.icon)]} size={40} label={b.source} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.85rem] font-semibold text-fg">{b.source}</span>
                      <span className="block truncate text-xs text-fg-3" title={b.items.map(dn).join(", ")}>
                        {b.used ? t("power.used") : t("power.alternative")} · {b.items.map(dn).join(", ")}
                      </span>
                    </span>
                    <QuantityStepper
                      value={Math.max(1, counts[b.source] ?? 1)}
                      unit={t("power.pcs")}
                      label={b.source}
                      onChange={(n) => setCounts((prev) => ({ ...prev, [b.source]: Math.max(1, n) }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {plan.map((row) => {
            const recipe = byId.get(row.recipeId);
            if (!recipe) return null;
            const options = (byName.get(recipe.name) ?? []).filter((r) => allowed(r) || r.id === recipe.id);
            const root = chains.get(row.key);
            return (
              <div key={row.key} className="facility-plan">
                <div className="factory-plan-row">
                  <ItemIcon sources={[assetUrl(recipe.icon_url)]} size={48} label={dn(recipe.name)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{dn(recipe.name)}</span>
                    <span className="mt-0.5 block truncate text-xs text-fg-3">{t("facility.perRun", { n: fmt(recipe.output_quantity) })}</span>
                  </span>
                  <QuantityStepper value={row.amount} unit={unitOf(facilityData(recipe)?.output_unit ?? null)} label={dn(recipe.name)} onChange={(n) => update(row.key, { amount: Math.max(0, n) })} />
                  <button type="button" className="row-remove" onClick={() => update(row.key, { amount: 0 })} title={t("tools.removeFromQueue")} aria-label={t("tools.removeFromQueue")}><Icon name="close" size={15} /></button>
                </div>
                <div className="facility-recipe" data-guide="facility-recipe">
                  <span className="text-xs font-medium text-fg-3">{t("facility.recipe")}{options.length > 1 ? ` • ${t("facility.recipes", { n: options.length })}` : ""}</span>
                  <RecipePicker options={options} value={recipe.id} onChange={(id) => update(row.key, { recipeId: id })} />
                </div>
                {root ? (
                  <details className="facility-chain" open>
                    <summary>{t("facility.chain")}</summary>
                    <ChainTier depth={1} parent={dn(root.name)}>
                      {root.children.map((child, i) => (
                        <ChainItem key={`${child.name}-${i}`} depth={1} node={child} byName={byName} allowed={allowed} choice={choice} setChoice={setChoice} unitOf={unitOf} />
                      ))}
                    </ChainTier>
                  </details>
                ) : null}
              </div>
            );
          })}
        </ResourceSummaryPanel>
      </div>
      {canSend ? (
        <SendOrderDialog
          open={sendOpen}
          lines={roots.map((n) => ({ name: dn(n.name), item_code: n.recipe?.item_code ?? null, quantity: Math.max(1, Math.ceil(n.amount)), unit: "unit" as const, icon_url: n.icon_url }))}
          defaultKind="factory"
          onClose={() => setSendOpen(false)}
          onSent={() => {
            setSendOpen(false);
            onSent?.();
          }}
        />
      ) : null}
    </div>
    </DisplayName.Provider>
  );
};

/** Ярус цепочки: рамка цвета глубины и подпись «Ярус N • для предмета». */
const ChainTier: React.FC<React.PropsWithChildren<{ depth: number; parent: string }>> = ({ depth, parent, children }) => {
  const { t } = useI18n();
  return (
    <div className="chain-tier" data-depth={((depth - 1) % 4) + 1}>
      <div className="chain-tier-label">{t("facility.tier", { n: depth, name: parent })}</div>
      <ul>{children}</ul>
    </div>
  );
};

/** Узел цепочки: количество и выбор — сырьё или один из рецептов (выбор общий для предмета). */
const ChainItem: React.FC<{
  depth: number;
  node: ChainNode;
  byName: Map<string, Recipe[]>;
  allowed: (r: Recipe) => boolean;
  choice: ChainChoice;
  setChoice: React.Dispatch<React.SetStateAction<ChainChoice>>;
  unitOf: (unit: string | null) => string;
}> = ({ depth, node, byName, allowed, choice, setChoice, unitOf }) => {
  const { t } = useI18n();
  const dn = useDisplayName();
  const options = (byName.get(node.name) ?? []).filter(allowed);
  const value = node.recipe?.id ?? choice[node.name] ?? RAW;
  return (
    <li className="chain-node">
      <div className="facility-node">
        <ItemIcon sources={[assetUrl(node.icon_url)]} size={24} label={dn(node.name)} />
        <span className="min-w-0 flex-1 truncate text-[0.8rem] text-fg">{dn(node.name)}</span>
        <span className="count-pill shrink-0">{fmt(Math.ceil(node.amount * 10) / 10)} {unitOf(node.unit)}</span>
      </div>
      {node.cycle ? <span className="pl-8 text-xs text-warn">↻ {t("facility.cycle")}</span> : null}
      {options.length > 0 && !node.cycle ? (
        <div className="facility-node-pick">
          <RecipePicker options={options} value={value} allowRaw onChange={(id) => setChoice((prev) => ({ ...prev, [node.name]: id }))} />
        </div>
      ) : null}
      {node.recipe && node.children.length ? (
        <ChainTier depth={depth + 1} parent={dn(node.name)}>
          {node.children.map((child, i) => (
            <ChainItem key={`${child.name}-${i}`} depth={depth + 1} node={child} byName={byName} allowed={allowed} choice={choice} setChoice={setChoice} unitOf={unitOf} />
          ))}
        </ChainTier>
      ) : null}
    </li>
  );
};

/** Карточка рецепта: постройка, модификация, входы с иконками → выход, время и мощность. */
const RecipeCard: React.FC<{ recipe: Recipe | null; selected?: boolean; onClick: () => void; trailing?: React.ReactNode }> = ({ recipe, selected, onClick, trailing }) => {
  const { t } = useI18n();
  const dn = useDisplayName();
  const d = recipe ? facilityData(recipe) : null;
  return (
    <button type="button" className={`recipe-card ${selected ? "is-selected" : ""}`} onClick={onClick}>
      {!recipe || !d ? (
        <span className="recipe-card-head">
          <span className="recipe-card-source">{t("facility.raw")}</span>
          {trailing}
        </span>
      ) : (
        <>
          <span className="recipe-card-head">
            <span className="recipe-card-source">{dn(d.source)}</span>
            {d.module ? <span className="recipe-card-module">{d.module}</span> : null}
            {trailing}
          </span>
          <span className="recipe-card-flow">
            {d.inputs.map((p) => (
              <span key={p.name} className="recipe-part" title={dn(p.name)}>
                <ItemIcon sources={[assetUrl(p.icon_url)]} size={22} label={dn(p.name)} />
                <span className="truncate">{dn(p.name)}</span>
                <b>{fmt(p.amount)}{p.unit ? ` ${p.unit}` : ""}</b>
              </span>
            ))}
            {d.vehicle ? <span className="recipe-part"><span className="truncate">{d.vehicle}</span><b>1</b></span> : null}
            <span className="recipe-arrow" aria-hidden>→</span>
            <span className="recipe-part is-out"><b>×{fmt(recipe.output_quantity)}</b></span>
          </span>
          {d.seconds || d.power_mw ? (
            <span className="recipe-card-meta">
              {d.seconds ? formatDuration(d.seconds, timeUnits(t)) : ""}{d.seconds && d.power_mw ? " · " : ""}{d.power_mw ? `${fmt(d.power_mw)} MW` : ""}
            </span>
          ) : null}
        </>
      )}
    </button>
  );
};

/** Выбор рецепта: выбранный — крупной карточкой; по клику раскрываются альтернативы. */
const RecipePicker: React.FC<{ options: Recipe[]; value: string; onChange: (id: string) => void; allowRaw?: boolean }> = ({ options, value, onChange, allowRaw }) => {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const current = options.find((r) => r.id === value) ?? null;
  const count = options.length + (allowRaw ? 1 : 0);
  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };
  if (!open) {
    return (
      <RecipeCard
        recipe={value === RAW ? null : current}
        selected
        onClick={() => count > 1 && setOpen(true)}
        trailing={count > 1 ? <span className="recipe-card-change">{t("facility.change")}</span> : null}
      />
    );
  }
  return (
    <div className="recipe-options">
      {allowRaw ? <RecipeCard recipe={null} selected={value === RAW} onClick={() => pick(RAW)} /> : null}
      {options.map((r) => (
        <RecipeCard key={r.id} recipe={r} selected={r.id === value} onClick={() => pick(r.id)} />
      ))}
    </div>
  );
};
