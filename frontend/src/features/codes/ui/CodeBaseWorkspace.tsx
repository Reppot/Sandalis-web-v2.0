"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { catalogApi, type FoxholeItem, type ParseResult } from "@/entities/item";
import { ItemIcon, Loading, assetUrl, copyText, downloadBlob, errorText, useNotify } from "@/shared";

const FACTIONS: Record<string, string> = { colonial: "Колонисты", warden: "Варден", neutral: "Нейтральные" };

function toJson(entries: FoxholeItem[]): string {
  return JSON.stringify(entries.map((e) => ({ code: e.code, nameEn: e.englishName, nameRu: e.name, icon: e.iconUrl })), null, 2);
}

function toCsv(entries: FoxholeItem[]): string {
  const esc = (v: string | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    ["Код JSON", "English name", "Русское название", "Категория", "Фракция", "Иконка"].map(esc).join(","),
    ...entries.map((e) => [e.code, e.englishName, e.name, e.category, e.faction, e.iconUrl].map(esc).join(",")),
  ].join("\n");
}

/** Реестр кодов Foxhole — каталог сервера, тот же, что у сканера и конструктора. */
export const CodeBaseWorkspace: React.FC = () => {
  const notify = useNotify();
  const { label, list } = useContent();
  const [entries, setEntries] = React.useState<FoxholeItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [faction, setFaction] = React.useState("all");
  const [reviewOnly, setReviewOnly] = React.useState(false);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [rawExport, setRawExport] = React.useState("");
  const [compare, setCompare] = React.useState<ParseResult | null>(null);
  const [comparing, setComparing] = React.useState(false);

  React.useEffect(() => {
    catalogApi
      .all()
      .then(setEntries)
      .catch((err) => notify({ title: "БАЗА КОДОВ", message: errorText(err, "Каталог недоступен"), tone: "danger" }))
      .finally(() => setLoading(false));
  }, [notify]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU");
    return entries.filter((e) => {
      const hay = `${e.code} ${e.englishName} ${e.name} ${e.aliases.join(" ")}`.toLocaleLowerCase("ru-RU");
      return (!needle || hay.includes(needle)) && (category === "all" || e.category === category) && (faction === "all" || e.faction === faction) && (!reviewOnly || e.needsReview);
    });
  }, [entries, query, category, faction, reviewOnly]);

  const reviewCount = entries.filter((e) => e.needsReview).length;

  const runCompare = async () => {
    if (!rawExport.trim()) return;
    setComparing(true);
    try {
      const result = await catalogApi.parse(rawExport);
      setCompare(result);
      notify({
        title: "СРАВНЕНИЕ ВЫГРУЗКИ СКЛАДА",
        message: `Строк: ${result.lines.length} • совпало: ${result.matched} • неизвестных: ${result.unknown.length}`,
        tone: result.unknown.length ? "warning" : "success",
      });
    } catch (err) {
      setCompare(null);
      notify({ title: "ВЫГРУЗКА СКЛАДА", message: errorText(err, "Невалидная выгрузка"), tone: "danger" });
    } finally {
      setComparing(false);
    }
  };

  return (
    <div className="tab-fade flex min-h-full flex-col gap-3">
      <section className="panel panel-corners rounded-md p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="hud-label text-muted">Foxhole logistics intelligence registry</div>
            <h1 className="panel-title mt-1 text-[1rem] md:text-[1.2rem]">⌘ База кодов предметов Foxhole</h1>
            <p className="mt-1 max-w-3xl text-[0.8rem] text-white/70">Код JSON, English name, русское название и иконка. Реестр хранится на сервере и используется сканером MapData, монитором склада и конструктором.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Stat label="ВСЕГО ЗАПИСЕЙ" value={entries.length} />
            <Stat label="С ИКОНКОЙ" value={entries.filter((e) => e.iconUrl).length} color="var(--accent)" />
            <Stat label="ТРЕБУЮТ ПРОВЕРКИ" value={reviewCount} color="var(--warn)" />
          </div>
        </div>
        <div className="stencil-line mt-3" />

        <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
          <input className="field field-mono min-w-0 flex-1" placeholder="Поиск: код, EN, RU…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="field w-full lg:w-44" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">Все категории</option>
            {list<{ label: string }>("catalog_category").map((c) => (
              <option key={c.key} value={c.key}>{c.payload.label}</option>
            ))}
          </select>
          <select className="field w-full lg:w-40" value={faction} onChange={(e) => setFaction(e.target.value)}>
            <option value="all">Все фракции</option>
            {Object.entries(FACTIONS).map(([key, name]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
          <button className={`btn ${reviewOnly ? "btn-active btn-warn" : ""}`} onClick={() => setReviewOnly((v) => !v)}>
            {reviewOnly ? "✓ только спорные" : "только спорные"}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="hud-label text-muted">Показано: <b className="text-white">{filtered.length}</b> / {entries.length}</span>
          <span className="flex-1" />
          <button className="btn" onClick={() => void copyText(toJson(filtered)).then((ok) => notify(ok ? { title: "БАЗА КОДОВ", message: `Скопировано строк: ${filtered.length}`, tone: "success" } : { title: "БУФЕР ОБМЕНА", message: "Браузер не разрешил доступ к буферу обмена.", tone: "warning" }))}>
            ⧉ Копировать строки
          </button>
          <button className="btn" onClick={() => downloadBlob(new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8" }), "sindaris-code-base.csv")}>CSV</button>
          <button className="btn" onClick={() => downloadBlob(new Blob([toJson(filtered)], { type: "application/json;charset=utf-8" }), "sindaris-code-base.json")}>JSON</button>
          <button className={`btn ${compareOpen ? "btn-active" : ""}`} onClick={() => setCompareOpen((v) => !v)}>⇄ ВЫГРУЗКА СКЛАДА</button>
        </div>
      </section>

      {compareOpen && (
        <section className="panel rounded-md p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="panel-title mr-auto text-[0.78rem]">Сравнение с сырой выгрузкой склада</h2>
            {compare && <span className="hud-label text-muted">строк: {compare.lines.length} • совпало: {compare.matched} • неизвестных: {compare.unknown.length} • Σ: {compare.lines.reduce((n, l) => n + l.count, 0)}</span>}
          </div>
          <textarea className="field field-mono mt-3 h-48 resize-y text-xs" placeholder={"Вставьте текстовый отчёт Foxhole:\nClanshead Valley - The King - Морской порт - Public - X: 0.49 Y: 0.38,2026.09.20-08.25.33\nНазвание предмета (Ящик),0\nНазвание техники,1"} value={rawExport} onChange={(e) => setRawExport(e.target.value)} />
          {compare?.unknown.length ? (
            <div className="mt-2 text-xs text-warn">
              Не найдены в реестре: {compare.unknown.slice(0, 8).join(" • ")}
              {compare.unknown.length > 8 ? ` • ещё ${compare.unknown.length - 8}` : ""}
            </div>
          ) : null}
          <div className="mt-2 flex justify-end">
            <button className="btn btn-primary" disabled={comparing || !rawExport.trim()} onClick={() => void runCompare()}>
              {comparing ? "ПЕРЕДАЧА..." : "Сравнить выгрузку"}
            </button>
          </div>
        </section>
      )}

      <section className="panel panel-corners min-h-0 flex-1 overflow-hidden rounded-md">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="panel-title text-[0.78rem]">Реестр кодов Foxhole</h2>
            <div className="hud-label mt-1 text-muted">Оригинальные технические имена • источник: каталог сервера</div>
          </div>
        </div>
        {loading ? (
          <Loading label="📡 ЗАГРУЗКА РЕЕСТРА..." />
        ) : (
          <div className="scroll-area max-h-[calc(100dvh-330px)] overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-[0.76rem]">
              <thead className="sticky top-0 z-10 bg-[#0b110c] text-[0.65rem] tracking-[0.12em] text-white/60 uppercase">
                <tr>
                  <th className="px-4 py-3" />
                  <th className="px-3 py-3">Код JSON</th>
                  <th className="px-3 py-3">English name</th>
                  <th className="px-3 py-3">Русское название</th>
                  <th className="px-3 py-3">Категория</th>
                  <th className="px-3 py-3">Фракция</th>
                  <th className="px-4 py-3">Статус</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.code} className="border-t border-white/5 transition-colors hover:bg-lime-300/10">
                    <td className="px-4 py-1.5"><ItemIcon sources={[assetUrl(e.iconUrl)]} size={30} label={e.name} /></td>
                    <td className="px-3 py-2 font-mono font-bold text-accent">{e.code}</td>
                    <td className="max-w-[280px] px-3 py-2 text-white/85">{e.englishName}</td>
                    <td className="max-w-[280px] px-3 py-2 text-white">{e.name}</td>
                    <td className="px-3 py-2"><span className="chip cursor-default">{label("catalog_category", e.category)}</span></td>
                    <td className="px-3 py-2 text-white/70">{FACTIONS[e.faction] ?? e.faction}</td>
                    <td className="px-4 py-2">{e.needsReview ? <span className="text-warn">⚠ проверка</span> : <span className="text-safe">● эталон</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && <div className="hud-label px-4 py-12 text-center text-muted">По заданным фильтрам записей не найдено.</div>}
          </div>
        )}
      </section>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color = "var(--accent)" }) => (
  <div className="rounded border border-white/10 bg-black/20 px-2.5 py-1.5">
    <div className="hud-label text-muted">{label}</div>
    <div className="mt-0.5 font-mono text-sm font-bold" style={{ color }}>{value}</div>
  </div>
);
