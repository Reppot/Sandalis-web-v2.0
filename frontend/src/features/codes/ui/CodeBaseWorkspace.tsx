"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { catalogApi, itemSearchHay, type FoxholeItem, type ParseResult } from "@/entities/item";
import { Icon, ItemIcon, Loading, PageHeader, SearchField, assetUrl, copyText, downloadBlob, errorText, matchesWords, useNotify, useT, type MessageKey, type Translate, PagedMore, usePaged, SheetHead, sortRows, type SheetSort } from "@/shared";

const FACTIONS: Record<string, MessageKey> = { colonial: "codes.faction.colonial", warden: "codes.faction.warden", neutral: "codes.faction.neutral" };

function toJson(entries: FoxholeItem[]): string {
  return JSON.stringify(entries.map((e) => ({ code: e.code, name: e.englishName, aliases: e.aliases, icon: e.iconUrl })), null, 2);
}

function toCsv(entries: FoxholeItem[], t: Translate): string {
  const esc = (v: string | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    [t("codes.col.code"), "English name", t("codes.col.ru"), t("codes.col.category"), t("codes.col.faction"), t("codes.col.icon")].map(esc).join(","),
    ...entries.map((e) => [e.code, e.englishName, e.aliases.join("; "), e.category, e.faction, e.iconUrl].map(esc).join(",")),
  ].join("\n");
}

/** Реестр кодов Foxhole — каталог сервера, тот же, что у сканера и конструктора. */
export const CodeBaseWorkspace: React.FC = () => {
  const notify = useNotify();
  const t = useT();
  const { label } = useContent();
  const [entries, setEntries] = React.useState<FoxholeItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  // фильтры и сортировка — в заголовках таблицы (как в Google Таблицах)
  const [sort, setSort] = React.useState<SheetSort | null>(null);
  const [categories, setCategories] = React.useState<Set<string> | null>(null);
  const [factions, setFactions] = React.useState<Set<string> | null>(null);
  const [statuses, setStatuses] = React.useState<Set<string> | null>(null);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [rawExport, setRawExport] = React.useState("");
  const [compare, setCompare] = React.useState<ParseResult | null>(null);
  const [comparing, setComparing] = React.useState(false);

  React.useEffect(() => {
    catalogApi
      .all()
      .then(setEntries)
      .catch((err) => notify({ title: t("codes.short"), message: errorText(err, t("builder.catalogFailed")), tone: "danger" }))
      .finally(() => setLoading(false));
  }, [notify, t]);

  const statusOf = (e: FoxholeItem) => (e.needsReview ? "review" : "ok");
  const filtered = React.useMemo(() => {
    const needle = query.trim();
    const rows = entries.filter(
      (e) =>
        (!needle || matchesWords(itemSearchHay(e), needle)) &&
        (!categories || categories.has(e.category)) &&
        (!factions || factions.has(e.faction)) &&
        (!statuses || statuses.has(statusOf(e))),
    );
    return sortRows(rows, sort, (e, key) =>
      key === "code" ? e.code : key === "en" ? e.englishName : key === "ru" ? e.aliases.join(" ") : key === "category" ? label("catalog_category", e.category) : key === "faction" ? e.faction : statusOf(e),
    );
  }, [entries, query, categories, factions, statuses, sort, label]);
  const page = usePaged(filtered, 100, [query, [...(categories ?? [])], [...(factions ?? [])], [...(statuses ?? [])], sort?.key, sort?.dir].join("|"));
  const countBy = (pick: (e: FoxholeItem) => string) => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(pick(e), (m.get(pick(e)) ?? 0) + 1);
    return m;
  };
  const categoryCounts = countBy((e) => e.category);
  const factionCounts = countBy((e) => e.faction);
  const anyFilter = Boolean(categories || factions || statuses || sort);

  const reviewCount = entries.filter((e) => e.needsReview).length;

  const runCompare = async () => {
    if (!rawExport.trim()) return;
    setComparing(true);
    try {
      const result = await catalogApi.parse(rawExport);
      setCompare(result);
      notify({
        title: t("codes.compareTitle"),
        message: t("codes.compareStats", { lines: result.lines.length, matched: result.matched, unknown: result.unknown.length }),
        tone: result.unknown.length ? "warning" : "success",
      });
    } catch (err) {
      setCompare(null);
      notify({ title: t("codes.export"), message: errorText(err, t("codes.invalidExport")), tone: "danger" });
    } finally {
      setComparing(false);
    }
  };

  return (
    <div className="tab-fade flex min-h-full flex-col gap-4">
      <PageHeader
        icon="codes"
        eyebrow={t("eyebrow.codes")}
        title={t("codes.title")}
        lead={t("codes.subtitle")}
        actions={
          <div className="stat-row" data-guide="codes-stats">
            <Stat label={t("codes.total")} value={entries.length} />
            <Stat label={t("codes.withIcon")} value={entries.filter((e) => e.iconUrl).length} />
            <Stat label={t("codes.needReview")} value={reviewCount} tone="warn" />
          </div>
        }
      >
        <div className="divider" />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <SearchField className="min-w-0 flex-1" size="lg" data-guide="codes-search" placeholder={t("codes.search")} value={query} onChange={setQuery} />
          {anyFilter ? (
            <button
              className="btn btn-ghost h-11"
              data-guide="codes-filters"
              onClick={() => {
                setCategories(null);
                setFactions(null);
                setStatuses(null);
                setSort(null);
              }}
            >
              <Icon name="close" size={15} />
              {t("sheet.reset")}
            </button>
          ) : (
            <span className="text-xs text-fg-3" data-guide="codes-filters">{t("sheet.hint")}</span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-fg-3">{t("codes.shown")}: <b className="text-fg">{filtered.length}</b> / {entries.length}</span>
          <span className="flex-1" />
          <button className="btn" data-guide="codes-copy" onClick={() => void copyText(toJson(filtered)).then((ok) => notify(ok ? { title: t("codes.short"), message: t("codes.copied", { n: filtered.length }), tone: "success" } : { title: t("export.clipboardTitle"), message: t("export.clipboardUnavailable"), tone: "warning" }))}>
            <Icon name="copy" size={15} />
            {t("codes.copy")}
          </button>
          <button className="btn" onClick={() => downloadBlob(new Blob([toCsv(filtered, t)], { type: "text/csv;charset=utf-8" }), "sindaris-code-base.csv")}>
            <Icon name="download" size={15} />
            CSV
          </button>
          <button className="btn" onClick={() => downloadBlob(new Blob([toJson(filtered)], { type: "application/json;charset=utf-8" }), "sindaris-code-base.json")}>
            <Icon name="download" size={15} />
            JSON
          </button>
          <button className={`btn ${compareOpen ? "btn-active" : ""}`} data-guide="codes-compare" aria-pressed={compareOpen} onClick={() => setCompareOpen((v) => !v)}>
            <Icon name="table" size={15} />
            {t("codes.export")}
          </button>
        </div>
      </PageHeader>

      {compareOpen && (
        <section className="panel p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="panel-title mr-auto">{t("codes.compareHeading")}</h2>
            {compare && <span className="text-xs text-fg-3">{t("codes.compareStats", { lines: compare.lines.length, matched: compare.matched, unknown: compare.unknown.length })} • Σ: {compare.lines.reduce((n, l) => n + l.count, 0)}</span>}
          </div>
          <textarea className="field field-mono mt-3 h-48 resize-y text-xs" placeholder={t("codes.comparePlaceholder")} value={rawExport} onChange={(e) => setRawExport(e.target.value)} />
          {compare?.unknown.length ? (
            <div className="mt-2 text-xs text-warn">
              {t("codes.notFound")}: {compare.unknown.slice(0, 8).join(" • ")}
              {compare.unknown.length > 8 ? ` • ${t("common.more", { n: compare.unknown.length - 8 })}` : ""}
            </div>
          ) : null}
          <div className="mt-2 flex justify-end">
            <button className="btn btn-primary" disabled={comparing || !rawExport.trim()} onClick={() => void runCompare()}>
              {comparing ? t("common.sending") : t("codes.compare")}
            </button>
          </div>
        </section>
      )}

      <section className="panel min-h-0 flex-1 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="panel-title">{t("codes.registry")}</h2>
            <div className="mt-0.5 text-xs text-fg-3">{t("codes.registryHint")}</div>
          </div>
        </div>
        {loading ? (
          <Loading label={t("codes.loading")} />
        ) : (
          <div className="scroll-area max-h-[calc(100dvh-330px)] overflow-auto">
            <table data-guide="codes-table" className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th className="px-4 py-3" />
                  <SheetHead label={t("codes.col.code")} sortKey="code" sort={sort} onSort={setSort} />
                  <SheetHead label="English name" sortKey="en" sort={sort} onSort={setSort} />
                  <SheetHead label={t("codes.col.ru")} sortKey="ru" sort={sort} onSort={setSort} />
                  <SheetHead
                    label={t("codes.col.category")}
                    sortKey="category"
                    sort={sort}
                    onSort={setSort}
                    filter={{
                      options: [...categoryCounts].map(([value, count]) => ({ value, label: label("catalog_category", value), count })).sort((a, b) => a.label.localeCompare(b.label)),
                      selected: categories,
                      onChange: setCategories,
                    }}
                  />
                  <SheetHead
                    label={t("codes.col.faction")}
                    sortKey="faction"
                    sort={sort}
                    onSort={setSort}
                    filter={{
                      options: [...factionCounts].map(([value, count]) => ({ value, label: FACTIONS[value] ? t(FACTIONS[value]) : value, count })),
                      selected: factions,
                      onChange: setFactions,
                    }}
                  />
                  <SheetHead
                    label={t("doc.status")}
                    sortKey="status"
                    sort={sort}
                    onSort={setSort}
                    filter={{
                      options: [
                        { value: "ok", label: t("codes.reference"), count: entries.length - reviewCount },
                        { value: "review", label: t("codes.review"), count: reviewCount },
                      ],
                      selected: statuses,
                      onChange: setStatuses,
                    }}
                  />
                </tr>
              </thead>
              <tbody>
                {page.items.map((e) => (
                  <tr key={e.code}>
                    <td className="px-4 py-1.5"><ItemIcon sources={[assetUrl(e.iconUrl)]} size={30} label={e.name} /></td>
                    <td className="px-3 py-2 font-mono text-[0.78rem] font-semibold">{e.code}</td>
                    <td className="max-w-[280px] px-3 py-2 text-fg">{e.englishName}</td>
                    <td className="max-w-[280px] px-3 py-2 text-fg-2">{e.aliases.join(" • ") || "—"}</td>
                    <td className="px-3 py-2"><span className="badge badge-neutral">{label("catalog_category", e.category)}</span></td>
                    <td className="px-3 py-2 text-fg-2">{FACTIONS[e.faction] ? t(FACTIONS[e.faction]) : e.faction}</td>
                    <td className="px-4 py-2">{e.needsReview ? <span className="badge badge-warn">{t("codes.review")}</span> : <span className="badge badge-accent">{t("codes.reference")}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && <div className="px-4 py-14 text-center text-sm text-fg-3">{t("common.nothingFilter")}</div>}
            <PagedMore page={page} />
          </div>
        )}
      </section>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; tone?: "warn" }> = ({ label, value, tone }) => (
  <div className="stat">
    <div className={`stat-value ${tone === "warn" ? "text-warn" : ""}`}>{value.toLocaleString()}</div>
    <div className="stat-label">{label}</div>
  </div>
);
