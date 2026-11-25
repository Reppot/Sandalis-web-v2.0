"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import type { RefineryData, Recipe } from "@/entities/recipe";
import { MATERIAL_CODES, codeSynonyms } from "@/entities/item";
import { FilterCards, ItemIcon, QuantityStepper, assetUrl, buildTxt, copyText, formatDuration, matchesWords, timeUnits, useI18n, useNotify, Icon, SearchField, Segmented, UiGlyph } from "@/shared";
import { ToolHeader } from "@/features/tools/ui/ToolHeader";
import { ResourceSummaryPanel, toolDoc, type ToolReport } from "@/features/tools/ui/ResourceSummaryPanel";
import { truckLines } from "@/features/tools/ui/trucks";
import { PaneToggles, paneCardsClass, paneGridClass, usePanes } from "@/features/tools/ui/ToolPanes";

type InputUnit = "crate" | "unit";
interface PlanEntry {
  quantity: number;
  unit: InputUnit;
}

const data = (r: Recipe) => r.data as unknown as RefineryData;
const unitsFor = (r: Recipe, e: PlanEntry) => (e.unit === "crate" && data(r).crate_size > 1 ? e.quantity * data(r).crate_size : e.quantity);
const rawFor = (r: Recipe, units: number) => units * data(r).input_per_unit;
const secondsFor = (r: Recipe, units: number) => units * data(r).seconds_per_unit;

/** Сырьё → продукт: сколько сырья, ящиков и времени нужно Refinery (рецепты с сервера). */
export const RefineryCalculator: React.FC<{ recipes: Recipe[] }> = ({ recipes }) => {
  const notify = useNotify();
  const { t, locale, dateLocale } = useI18n();
  const rname = React.useCallback((r: Recipe) => (locale === "ru" ? r.name : r.name_en ?? r.name), [locale]);
  const num = (n: number, digits?: number) => n.toLocaleString(dateLocale, digits === undefined ? undefined : { maximumFractionDigits: digits });
  const { label, labelIcon, list } = useContent();
  const [group, setGroup] = React.useState("all");
  const [query, setQuery] = React.useState("");
  const [plan, setPlan] = React.useState<Record<string, PlanEntry>>({});
  const panes = usePanes();

  const visible = React.useMemo(() => {
    const needle = query.trim();
    return recipes.filter((r) => {
      const text = `${r.name} ${r.name_en ?? ""} ${r.item_code ?? ""} ${codeSynonyms(r.item_code).join(" ")} ${r.item_class ?? ""} ${label("material", data(r).input)} ${data(r).input} ${codeSynonyms(MATERIAL_CODES[data(r).input]).join(" ")}`;
      return (group === "all" || r.category === group) && (!needle || matchesWords(text, needle));
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
      toolName: t("tools.refinery"),
      subtitle: t("tools.refinerySubtitle"),
      fileBase: "Chronomancer_refinery",
      items: rows.map(({ recipe, entry, units }) => ({
        name: `${rname(recipe)} (${recipe.item_class})`,
        quantity: entry.quantity,
        unit: entry.unit === "crate" ? t("unit.crate") : data(recipe).unit_label,
        note: entry.unit === "crate" ? `= ${units} ${data(recipe).unit_label}` : undefined,
        icon: assetUrl(recipe.icon_url),
      })),
      resources: Object.entries(resources)
        .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
        .map(([key, amount]) => ({ name: label("material", key), quantity: amount, unit: t("unit.unit"), icon: labelIcon("material", key) })),
      stats: [
        { name: t("tools.time"), quantity: formatDuration(seconds, timeUnits(t)), unit: "" },
        { name: t("tools.outputCrates"), quantity: outputCrates, unit: t("unit.crate") },
        ...truckLines(outputCrates, t),
      ],
    };
  }, [rows, label, labelIcon, list, t, rname]);

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
      <ToolHeader
        icon={<UiGlyph icon="refinery" size={26} />}
        eyebrow={t("eyebrow.refinery")}
        title={t("tools.refinery")}
        hint={t("tools.refineryHint")}
        actions={
          <button className="btn btn-primary h-10" onClick={() => void copyText(buildTxt(toolDoc(report, t))).then((ok) => notify(ok ? { title: t("tools.refinery"), message: t("tools.calcCopied"), tone: "success" } : { title: t("export.clipboardTitle"), message: t("tools.copyFailed"), tone: "warning" }))}>
            <Icon name="copy" size={16} />
            {t("tools.shareCalc")}
          </button>
        }
      />

      <PaneToggles panes={panes} catalogLabel={t("tools.catalogPane")} planLabel={t("tools.refineryQueue")} />

      <div className={paneGridClass(panes)} data-wide={panes.wide}>
        <section className={`panel factory-catalog ${panes.catalog ? "" : "hidden"}`}>
          <div className="filter-head">
            <span className="tool-section-label">{t("tools.categories")}</span>
          </div>
          <FilterCards
            guide="tool-cats"
            label={t("tools.categories")}
            items={[
              { key: "all", label: t("common.all"), glyph: "refinery", hint: t("facility.items", { n: recipes.length }) },
              ...groups.flatMap((g) => {
                const inGroup = recipes.filter((r) => r.category === g.key);
                return inGroup.length ? [{ key: g.key, label: g.payload.label, icon: assetUrl(inGroup[0].icon_url), hint: t("facility.items", { n: inGroup.length }) }] : [];
              }),
            ]}
            value={group}
            onChange={(k) => setGroup(k ?? "all")}
          />
          <SearchField className="mt-4" placeholder={t("tools.refinerySearch")} value={query} onChange={setQuery} />
          <div className="factory-count text-xs">{t("codes.shown")}: {visible.length} / {recipes.length} • {t("tools.dataSource")}: foxhole.wiki.gg</div>

          <div className={paneCardsClass(panes)}>
            {visible.map((recipe) => {
              const d = data(recipe);
              const queued = plan[recipe.id];
              return (
                <button key={recipe.id} type="button" className={`factory-item-card tool-item min-h-[14.5rem] ${queued ? "is-selected" : ""}`} onClick={() => add(recipe)} title={`${locale === "ru" ? recipe.name_en : recipe.name}: ${d.input_per_unit} × ${label("material", d.input)} → 1`}>
                  <span className="factory-add absolute top-2.5 right-2.5"><Icon name="plus" size={14} strokeWidth={2.5} /></span>
                  {queued ? <span className="queued-badge absolute top-2.5 left-2.5">{queued.quantity} {queued.unit === "crate" ? t("unit.crate") : d.unit_label}</span> : null}
                  <ItemIcon sources={[assetUrl(recipe.icon_url)]} size={88} label={rname(recipe)} className="mt-3" />
                  <strong className="line-clamp-2 min-h-[2.5em] w-full text-[0.85rem] font-semibold leading-tight text-fg">{rname(recipe)}</strong>
                  <small className="text-xs text-fg-3">{recipe.item_class} · {label("refinery_group", recipe.category)}</small>
                  <span className="cost-chip mt-auto gap-1.5 px-2 py-1">
                    <ItemIcon sources={[labelIcon("material", d.input)]} size={22} label={label("material", d.input)} />
                    {d.input_per_unit} × {label("material", d.input)} → 1
                  </span>
                  <small className="text-[0.7rem] text-fg-3">
                    {num(d.seconds_per_unit, 3)} {t("time.s")} / {d.unit_label} • {d.crate_size > 1 ? t("tools.crateSize", { n: d.crate_size }) : recipe.description ?? t("tools.noCrates")}
                  </small>
                </button>
              );
            })}
          </div>
        </section>

        <ResourceSummaryPanel report={report} title={t("tools.refineryQueue")} emptyHint={t("tools.refineryQueueHint")} onClear={() => setPlan({})} hidden={!panes.plan} inline={panes.wide === "plan"}>
          {rows.map(({ recipe, entry, units }) => {
            const d = data(recipe);
            return (
              <div className="factory-plan-row flex-wrap" key={recipe.id}>
                <ItemIcon sources={[assetUrl(recipe.icon_url)]} size={56} label={rname(recipe)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{rname(recipe)}</span>
                  <span className="mt-0.5 block truncate text-xs text-fg-3">
                    = {num(units)} {d.unit_label} • {num(rawFor(recipe, units))} {label("material", d.input)} • {formatDuration(secondsFor(recipe, units), timeUnits(t))}
                  </span>
                  {units > d.personal_limit ? <span className="mt-0.5 block text-xs text-warn">{t("tools.personalLimit", { personal: num(d.personal_limit), squad: num(d.personal_limit * 2) })}</span> : null}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <QuantityStepper value={entry.quantity} unit={entry.unit === "crate" ? t("unit.crate") : d.unit_label} label={rname(recipe)} onChange={(n) => setQuantity(recipe, n)} />
                  {d.crate_size > 1 ? (
                    <Segmented
                      size="sm"
                      label={t("tools.inputUnits", { name: rname(recipe) })}
                      value={entry.unit}
                      onChange={(u) => setUnit(recipe, u)}
                      options={[
                        { value: "crate", label: t("builder.crateShort"), title: t("tools.cratesOf", { n: d.crate_size }) },
                        { value: "unit", label: t("builder.unitShort"), title: t("tools.perUnit") },
                      ]}
                    />
                  ) : null}
                  <button type="button" className="row-remove" onClick={() => setQuantity(recipe, 0)} title={t("tools.removeFromQueue")} aria-label={t("tools.removeFromQueue")}><Icon name="close" size={15} /></button>
                </div>
              </div>
            );
          })}
        </ResourceSummaryPanel>
      </div>
    </div>
  );
};
