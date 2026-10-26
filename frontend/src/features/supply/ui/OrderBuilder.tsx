"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { catalogApi, itemName, itemSearchHay, type FoxholeItem, type ItemUnit } from "@/entities/item";
import { orderDraft, type DraftLine } from "@/entities/report";
import { SendOrderDialog } from "@/entities/report/ui/SendOrderDialog";
import type { Stockpile } from "@/entities/stockpile";
import {
  ExportBar,
  FilterCards,
  SearchField,
  SectionHeader,
  Segmented,
  ItemIcon,
  Loading,
  Modal,
  assetUrl,
  errorText,
  matchesWords,
  searchText,
  useConfirm,
  useDocExport,
  useI18n,
  useNotify,
  xlsxToText,
  type ExportFormat,
  type PanelMode,
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
  const [sendOpen, setSendOpen] = React.useState(false);
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

  // карточки категорий: иконка первого предмета категории и число предметов
  const categories = React.useMemo(() => {
    const stats = new Map<string, { icon: string | null; count: number }>();
    for (const i of catalog) {
      const s = stats.get(i.category) ?? { icon: assetUrl(i.iconUrl), count: 0 };
      s.count += 1;
      stats.set(i.category, s);
    }
    return list<{ label: string }>("catalog_category").flatMap((c) => {
      const s = stats.get(c.key);
      return s ? [{ key: c.key, label: c.payload.label, icon: s.icon, hint: t("facility.items", { n: s.count }) }] : [];
    });
  }, [catalog, list, t]);

  const matrix = React.useMemo(() => {
    const q = searchText(filter.trim());
    const pool = category === "all" ? catalog : catalog.filter((i) => i.category === category);
    if (!q) return pool;
    // по словам и с алиасами: «граната bomastone», «collins 68-мм» находят предмет
    const hay = (i: FoxholeItem) => itemSearchHay(i);
    const starts = pool.filter((i) => searchText(i.name).startsWith(q));
    const includes = pool.filter((i) => !searchText(i.name).startsWith(q) && matchesWords(hay(i), q));
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
    addLine({ name: itemName(selected, locale), item_code: selected.code, quantity: n, unit, icon_url: selected.iconUrl });
    setCount("");
  };

  const adjust = (name: string, delta: number) => setOrder((prev) => prev.map((l) => (l.name === name ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l)));
  const remove = (name: string) => setOrder((prev) => prev.filter((l) => l.name !== name));


  const importText = async (text: string) => {
    setBusy(true);
    try {
      const result = await catalogApi.parse(text);
      if (!result.lines.length) {
        notify({ title: t("import.formatError"), message: t("builder.parseFailed"), tone: "danger" });
        return;
      }
      setOrder(result.lines.map((l) => ({ name: l.item ? itemName(l.item, locale) : l.name, item_code: l.item?.code ?? null, quantity: l.count, unit: l.unit, icon_url: l.item?.iconUrl ?? null })));
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
        sections: [{ rows: order.map((l) => ({ name: l.name, quantity: l.quantity, unit: t(l.unit === "crate" ? "unit.crate" : "unit.unit"), icon: assetUrl(l.icon_url) })) }],
        fileBase: "SINDARIS_order",
        sheetName: t("builder.sheet"),
      },
      fmt,
    );
  };

  return (
    <section data-guide="builder-panel" className="panel flex flex-col p-5">
      <SectionHeader
        icon="orders"
        title={t("builder.title")}
        meta={
          <>
            <span className="count-pill">{t("common.pos", { n: order.length })}</span>
            <span className="count-pill">Σ {totalUnits}</span>
          </>
        }
      />

      {/* выбор предмета и количества */}
      <div className="builder-composer mt-5">
        <div data-guide="builder-pick" className={`builder-picked ${selected ? "is-set" : ""}`} title={selected ? itemName(selected, locale) : t("builder.pick")}>
          {selected ? <ItemIcon sources={[assetUrl(selected.iconUrl)]} size={30} label={selected.name} /> : <span className="builder-picked-dot" aria-hidden />}
          <span className="truncate">{selected ? itemName(selected, locale) : t("builder.pick")}</span>
        </div>
        <input ref={countRef} className="field field-mono h-11" data-guide="builder-qty" placeholder={t("builder.qty")} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/[^\d]/g, ""))} onKeyDown={(e) => e.key === "Enter" && submitLine()} />
        <Segmented
          className="builder-unit"
          size="lg"
          label={t("builder.unitHint")}
          value={unit}
          onChange={setUnit}
          options={[
            { value: "crate", label: t("builder.crateShort"), title: t("unit.crate") },
            { value: "unit", label: t("builder.unitShort"), title: t("unit.unit") },
          ]}
        />
        <button className="btn btn-primary btn-lg" data-guide="builder-add" onClick={submitLine} disabled={!selected}>
          {t("builder.add")}
        </button>
      </div>

      <div className="mt-5 text-sm font-semibold text-fg-2">{t("tools.categories")}</div>
      <FilterCards
        guide="builder-cats"
        label={t("tools.categories")}
        items={[{ key: "all", label: t("common.all"), glyph: "crates", hint: t("facility.items", { n: catalog.length }) }, ...categories]}
        value={category}
        onChange={(k) => setCategory(k ?? "all")}
      />
      <SearchField className="mt-4" size="lg" data-guide="builder-filter" placeholder={t("builder.filter")} value={filter} onChange={setFilter} />

      <div data-guide="builder-matrix" className={`scroll-area panel-inner mt-3 p-1.5 ${isFullWidth ? "grid h-[340px] grid-cols-2 content-start gap-1 xl:grid-cols-3" : "h-[240px]"}`}>
        {catalogLoading ? (
          <Loading label={t("builder.loading")} className="col-span-full h-full min-h-0" skeleton={false} />
        ) : matrix.length === 0 ? (
          <div className="col-span-full flex h-full items-center justify-center text-sm text-fg-3">{t("common.nothingFound")}</div>
        ) : (
          matrix.map((item) => (
            <button key={item.code} className={`matrix-item ${isFullWidth ? "min-h-[64px]" : ""} ${selected?.code === item.code ? "is-selected" : ""}`} onClick={() => setSelected(item)} title={`${locale === "ru" ? item.englishName : item.name} • ${item.code}`}>
              <span className="flex min-w-0 items-center gap-3">
                <ItemIcon sources={[assetUrl(item.iconUrl)]} size={isFullWidth ? 48 : 30} label={itemName(item, locale)} />
                <span className={`truncate ${isFullWidth ? "text-[0.95rem] font-medium" : ""}`}>{itemName(item, locale)}</span>
              </span>
              <span className="matrix-cat shrink-0">{label("catalog_category", item.category)}</span>
            </button>
          ))
        )}
      </div>

      {/* сам заказ */}
      <div className="mt-7 flex items-center justify-between gap-2">
        <h3 className="text-[0.95rem] font-semibold">{t("builder.sheet")}</h3>
        <button
          className={`btn btn-ghost h-8 min-h-0 px-2.5 text-[0.8rem] text-danger ${armed === "clear" ? "btn-danger" : ""}`}
          onClick={() =>
            confirm("clear", () => {
              setOrder([]);
              notify({ title: t("builder.short"), message: t("builder.cleared"), tone: "warning" });
            })
          }
          data-guide="builder-clear"
          title={t("builder.clearHint")}
          disabled={!order.length}
        >
          {armed === "clear" ? t("common.confirmQ") : t("common.clear")}
        </button>
      </div>
      <div className="scroll-area mt-2 max-h-[42vh] min-h-[120px] flex-1">
        {order.length === 0 ? (
          <div className="builder-empty">{t("builder.empty")}</div>
        ) : (
          <ul data-guide="builder-order" className={`grid grid-cols-1 gap-1.5 sm:grid-cols-2 ${isFullWidth ? "xl:grid-cols-3" : ""}`}>
            {order.map((line) => (
              <li key={line.name} className="order-line group">
                <ItemIcon sources={[assetUrl(line.icon_url)]} size={isFullWidth ? 44 : 34} label={line.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] font-medium" title={line.item_code ? undefined : t("builder.notInCatalog")}>
                    {line.name}
                    {!line.item_code && <span className="text-warn"> ?</span>}
                  </span>
                  <span className="order-line-qty">
                    <button className="order-line-step" onClick={() => adjust(line.name, -1)} aria-label="−1">−</button>
                    <span className="tabular">{line.quantity} {t(line.unit === "crate" ? "unit.crate" : "unit.unit")}</span>
                    <button className="order-line-step" onClick={() => adjust(line.name, 1)} aria-label="+1">+</button>
                  </span>
                </span>
                <button className="order-line-remove" onClick={() => remove(line.name)} title={t("builder.remove")} aria-label={t("builder.remove")}>✕</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canWrite ? (
        <button className="btn btn-primary btn-lg mt-4 w-full" data-guide="builder-send" onClick={() => setSendOpen(true)} disabled={!order.length}>
          {t("orderSend.button")}
        </button>
      ) : (
        <div className="mt-3 text-sm text-fg-3">{t("builder.membersOnly")}</div>
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
        <p className="text-sm text-fg-2">{t("import.pasteHelp")}</p>
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
      <SendOrderDialog
        open={sendOpen}
        lines={order.map(({ name, item_code, quantity, unit: u, icon_url }) => ({ name, item_code, quantity, unit: u, icon_url }))}
        defaultKind="stockpile"
        meta={{ region: pinned?.region ?? null, stockpile: pinned?.name ?? null }}
        onClose={() => setSendOpen(false)}
        onSent={() => {
          setSendOpen(false);
          setOrder([]);
          onSubmitted();
        }}
      />
      {previewModal}
    </section>
  );
};
