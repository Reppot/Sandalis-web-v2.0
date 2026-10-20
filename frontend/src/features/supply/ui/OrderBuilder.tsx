"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { catalogApi, itemName, type FoxholeItem, type ItemUnit } from "@/entities/item";
import { orderDraft, reportApi, type DraftLine } from "@/entities/report";
import type { Stockpile } from "@/entities/stockpile";
import {
  ExportBar,
  ItemIcon,
  Loading,
  Modal,
  assetUrl,
  errorText,
  useConfirm,
  useDocExport,
  useI18n,
  useNotify,
  xlsxToText,
  type ExportFormat,
  type PanelMode,
  UiGlyph,
} from "@/shared";

interface OrderBuilderProps {
  canWrite: boolean;
  isFullWidth: boolean;
  pinned: Stockpile | null;
  /** Рапорт принят — открыть «Текущие заказы клана». */
  onSubmitted: () => void;
}

/** «Конструктор заказа»: матрица каталога → строки ЯЩ/ШТ → рапорт в штаб (POST /reports). */
export const OrderBuilder: React.FC<OrderBuilderProps> = ({ canWrite, isFullWidth, pinned, onSubmitted }) => {
  const notify = useNotify();
  const { t, locale } = useI18n();
  const { media, label, list } = useContent();
  const [catalog, setCatalog] = React.useState<FoxholeItem[]>([]);
  const [catalogLoading, setCatalogLoading] = React.useState(true);
  const [order, setOrder] = React.useState<DraftLine[]>([]);
  const [hydrated, setHydrated] = React.useState(false);
  const [selected, setSelected] = React.useState<FoxholeItem | null>(null);
  const [count, setCount] = React.useState("");
  const [unit, setUnit] = React.useState<ItemUnit>("crate");
  const [filter, setFilter] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [title, setTitle] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [mode, setMode] = React.useState<PanelMode>("export");
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [pasteText, setPasteText] = React.useState("");
  const [armed, confirm] = useConfirm();
  const countRef = React.useRef<HTMLInputElement>(null);
  const textInput = React.useRef<HTMLInputElement>(null);
  const xlsxInput = React.useRef<HTMLInputElement>(null);
  const { run: exportDoc, previewModal } = useDocExport(media("bg_report_texture"));

  React.useEffect(() => {
    setOrder(orderDraft.read());
    setHydrated(true);
    catalogApi
      .all()
      .then(setCatalog)
      .catch((err) => notify({ title: t("builder.catalog"), message: errorText(err, t("builder.catalogFailed")), tone: "danger" }))
      .finally(() => setCatalogLoading(false));
  }, [notify, t]);

  React.useEffect(() => {
    if (hydrated) orderDraft.write(order);
  }, [order, hydrated]);

  const categories = React.useMemo(() => {
    const present = new Set(catalog.map((i) => i.category));
    return list<{ label: string }>("catalog_category").filter((c) => present.has(c.key));
  }, [catalog, list]);

  const matrix = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    const pool = category === "all" ? catalog : catalog.filter((i) => i.category === category);
    if (!q) return pool;
    const hay = (i: FoxholeItem) => [i.name, i.englishName, i.code, ...i.aliases].join(" ").toLowerCase();
    const starts = pool.filter((i) => i.name.toLowerCase().startsWith(q));
    const includes = pool.filter((i) => !i.name.toLowerCase().startsWith(q) && hay(i).includes(q));
    return [...starts, ...includes];
  }, [filter, category, catalog]);

  const totalUnits = order.reduce((a, l) => a + l.quantity, 0);

  const addLine = (line: DraftLine) =>
    setOrder((prev) => {
      const existing = prev.find((l) => l.name === line.name);
      if (!existing) return [...prev, line];
      return prev.map((l) => (l.name === line.name ? (l.unit === line.unit ? { ...l, quantity: l.quantity + line.quantity } : line) : l));
    });

  const submitLine = () => {
    const n = parseInt(count, 10);
    if (!selected || !Number.isFinite(n) || n <= 0) return countRef.current?.focus();
    addLine({ name: selected.name, item_code: selected.code, quantity: n, unit, icon_url: selected.iconUrl });
    setCount("");
  };

  const adjust = (name: string, delta: number) => setOrder((prev) => prev.map((l) => (l.name === name ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l)));
  const remove = (name: string) => setOrder((prev) => prev.filter((l) => l.name !== name));

  const sendReport = async () => {
    setSaving(true);
    try {
      const r = await reportApi.create({
        title: title.trim(),
        meta: { region: pinned?.region ?? null, stockpile: pinned?.name ?? null },
        lines: order.map(({ name, item_code, quantity, unit: u }) => ({ name, item_code, quantity, unit: u })),
      });
      notify({ title: t("builder.accepted"), message: r.message, tone: "success" });
      setTitle("");
      setOrder([]);
      onSubmitted();
    } catch (err) {
      notify({ title: t("reports.report"), message: errorText(err, t("builder.rejected")), tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const importText = async (text: string) => {
    setBusy(true);
    try {
      const result = await catalogApi.parse(text);
      if (!result.lines.length) {
        notify({ title: t("import.formatError"), message: t("builder.parseFailed"), tone: "danger" });
        return;
      }
      setOrder(result.lines.map((l) => ({ name: l.item?.name ?? l.name, item_code: l.item?.code ?? null, quantity: l.count, unit: l.unit, icon_url: l.item?.iconUrl ?? null })));
      notify({ title: t("builder.importTitle"), message: t("builder.imported", { n: result.lines.length }), tone: "success" });
    } catch (err) {
      notify({ title: t("import.title"), message: errorText(err, t("builder.serverParseFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const pick = (ref: React.RefObject<HTMLInputElement | null>) => {
    if (!ref.current) return;
    ref.current.value = "";
    ref.current.click();
  };

  const onAction = (fmt: ExportFormat) => {
    if (mode === "import") {
      if (fmt === "txt") pick(textInput);
      else if (fmt === "xlsx") pick(xlsxInput);
      else if (fmt === "clipboard") {
        navigator.clipboard
          .readText()
          .then((text) => (text.trim() ? importText(text) : notify({ title: t("export.clipboardTitle"), message: t("import.clipboardEmpty"), tone: "warning" })))
          .catch(() => {
            setPasteText("");
            setPasteOpen(true);
          });
      }
      return;
    }
    void exportDoc(
      {
        title: `SINDARIS • ${t("builder.docTitle")}`,
        header: [`${t("doc.hex")}: ${pinned?.region ?? "—"}`, `${t("doc.stockpile")}: ${pinned?.name ?? "—"}`, `${t("doc.lines")}: ${order.length} • Σ ${totalUnits}`],
        sections: [{ rows: order.map((l) => ({ name: l.name, quantity: l.quantity, unit: t(l.unit === "crate" ? "unit.crate" : "unit.unit") })) }],
        fileBase: "SINDARIS_order",
        sheetName: t("builder.sheet"),
      },
      fmt,
    );
  };

  return (
    <section data-guide="builder-panel" className="panel panel-corners flex flex-col rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="panel-title flex items-center gap-2">
          <UiGlyph icon="orders" size={22} />
          🛠️ {t("builder.title")}
        </h2>
        <div className="flex items-center gap-2">
          <span className="badge-count min-w-0 px-2">{t("common.pos", { n: order.length })}</span>
          <span className="badge-count min-w-0 px-2">Σ {totalUnits}</span>
        </div>
      </div>
      <div className="stencil-line mt-2" />

      <div className={`order-builder-controls mt-4 rounded-md border border-emerald-900/60 bg-black/25 ${isFullWidth ? "px-5 py-8" : "px-3 py-6"}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(120px,1fr)_auto_auto]">
          <div data-guide="builder-pick" className={`field flex h-12 items-center gap-2 truncate text-base ${selected ? "text-accent" : "text-white/50"}`} title={selected ? itemName(selected, locale) : t("builder.pick")}>
            {selected && <ItemIcon sources={[assetUrl(selected.iconUrl)]} size={28} label={selected.name} />}
            <span className="truncate">{selected ? itemName(selected, locale) : t("builder.pick")}</span>
          </div>
          <input ref={countRef} className="field field-mono h-12 text-base" data-guide="builder-qty" placeholder={t("builder.qty")} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/[^\d]/g, ""))} onKeyDown={(e) => e.key === "Enter" && submitLine()} />
          <button
            className="btn h-12 min-w-[64px] px-3 text-base"
            onClick={() => setUnit((u) => (u === "crate" ? "unit" : "crate"))}
            style={unit === "unit" ? { background: "#ff9900", color: "#000", borderColor: "#ff9900" } : undefined}
            data-guide="builder-unit" title={t("builder.unitHint")}
          >
            {t(unit === "crate" ? "builder.crateShort" : "builder.unitShort")}
          </button>
          <button className="btn btn-primary h-12 px-5 text-sm" data-guide="builder-add" onClick={submitLine} disabled={!selected}>
            {t("builder.add")}
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <input className="field h-12 flex-1 text-base" data-guide="builder-filter" placeholder={t("builder.filter")} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <UiGlyph icon="search" size={40} className="hidden sm:block" />
        </div>
        <div className="scroll-area mt-4 flex gap-2 overflow-x-auto pb-2">
          <button className={`chip h-10 shrink-0 px-4 text-sm ${category === "all" ? "is-active" : ""}`} onClick={() => setCategory("all")}>{t("common.all")}</button>
          {categories.map((c) => (
            <button key={c.key} className={`chip h-10 shrink-0 px-4 text-sm ${category === c.key ? "is-active" : ""}`} onClick={() => setCategory(c.key)}>
              {c.payload.label}
            </button>
          ))}
        </div>

        <div className="mt-5 flex gap-3">
          <div data-guide="builder-matrix" className={`scroll-area panel-inner ${isFullWidth ? "grid h-[300px] grid-cols-2 gap-1.5 p-2 xl:grid-cols-3" : "h-[190px] p-1"} flex-1 rounded`}>
            {catalogLoading ? (
              <Loading label={t("builder.loading")} className="col-span-full min-h-0 h-full" />
            ) : matrix.length === 0 ? (
              <div className="hud-label col-span-full flex h-full items-center justify-center text-muted">{t("common.nothingFound")}</div>
            ) : (
              matrix.map((item) => (
                <button key={item.code} className={`matrix-item ${isFullWidth ? "min-h-[76px] px-3" : ""} ${selected?.code === item.code ? "is-selected" : ""}`} onClick={() => setSelected(item)} title={`${locale === "ru" ? item.englishName : item.name} • ${item.code}`}>
                  <span className="flex min-w-0 items-center gap-3">
                    <ItemIcon sources={[assetUrl(item.iconUrl)]} size={isFullWidth ? 64 : 28} label={itemName(item, locale)} />
                    <span className={`truncate ${isFullWidth ? "text-base font-semibold" : ""}`}>{itemName(item, locale)}</span>
                  </span>
                  <span className="matrix-cat shrink-0">{label("catalog_category", item.category)}</span>
                </button>
              ))
            )}
          </div>
          <button
            className={`btn ${isFullWidth ? "h-[300px]" : "h-[190px]"} w-[58px] flex-col px-0 btn-danger ${armed === "clear" ? "btn-active" : ""}`}
            onClick={() =>
              confirm("clear", () => {
                setOrder([]);
                notify({ title: t("builder.short"), message: t("builder.cleared"), tone: "warning" });
              })
            }
            data-guide="builder-clear" title={`⚠️ ${t("builder.clearHint")}`}
            disabled={!order.length}
          >
            <span className="text-xl">🗑</span>
            <span className="hud-label" style={{ writingMode: "vertical-rl" }}>{armed === "clear" ? t("common.confirmQ") : t("common.clear")}</span>
          </button>
        </div>
      </div>

      <div className="order-divider" aria-hidden />

      <div className="scroll-area panel-inner mt-10 max-h-[40vh] min-h-[180px] flex-1 rounded p-2">
        {order.length === 0 ? (
          <div className="empty-order flex h-[45px] items-center justify-center rounded px-3 text-center text-[0.8rem]">{t("builder.empty")}</div>
        ) : (
          <ul data-guide="builder-order" className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${isFullWidth ? "xl:grid-cols-4" : ""}`}>
            {order.map((line) => (
              <li key={line.name} className="row-item group min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <ItemIcon sources={[assetUrl(line.icon_url)]} size={isFullWidth ? 64 : 32} label={line.name} />
                  <span className={`truncate text-white ${isFullWidth ? "text-base font-semibold" : "text-[0.82rem]"}`} title={line.item_code ? undefined : t("builder.notInCatalog")}>
                    • {line.name}
                    {!line.item_code && <span className="text-warn"> ?</span>}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button className="btn px-1.5 py-0.5 opacity-60 group-hover:opacity-100" onClick={() => adjust(line.name, -1)} title="−1">−</button>
                  <span className="badge-count min-w-[85px]">{line.quantity} {t(line.unit === "crate" ? "unit.crate" : "unit.unit")}</span>
                  <button className="btn px-1.5 py-0.5 opacity-60 group-hover:opacity-100" onClick={() => adjust(line.name, 1)} title="+1">+</button>
                  <button className="btn btn-danger px-1.5 py-0.5 opacity-60 group-hover:opacity-100" onClick={() => remove(line.name)} title={t("builder.remove")}>✕</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canWrite ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input className="field field-mono flex-1 text-xs" placeholder={t("builder.reportName")} value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn btn-primary" data-guide="builder-send" onClick={() => void sendReport()} disabled={saving || !order.length}>
            {saving ? t("common.sending") : `📨 ${t("builder.send")}`}
          </button>
        </div>
      ) : (
        <div className="hud-label mt-2 text-muted">{t("builder.membersOnly")}</div>
      )}

      <ExportBar mode={mode} onToggleMode={() => setMode((m) => (m === "export" ? "import" : "export"))} onAction={onAction} busy={busy} />

      <input ref={textInput} type="file" accept=".json,.txt,application/json,text/plain" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void file.text().then(importText);
      }} />
      <input ref={xlsxInput} type="file" accept=".xlsx" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void xlsxToText(file).then(importText).catch((err) => notify({ title: "XLSX", message: errorText(err, t("import.xlsxFailed")), tone: "danger" }));
      }} />

      <Modal open={pasteOpen} onClose={() => setPasteOpen(false)} title={t("builder.pasteTitle")} icon="clipboard" widthClass="max-w-lg">
        <p className="hud-label text-muted">{t("import.pasteHelp")}</p>
        <textarea className="field field-mono mt-2 h-48 w-full resize-y text-xs" value={pasteText} onChange={(e) => setPasteText(e.target.value)} autoFocus />
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn" onClick={() => setPasteOpen(false)}>{t("common.cancel")}</button>
          <button className="btn btn-primary" onClick={() => {
            setPasteOpen(false);
            void importText(pasteText);
          }}>
            {t("import.recognize")}
          </button>
        </div>
      </Modal>
      {previewModal}
    </section>
  );
};
