"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { Scopes, type Can } from "@/entities/session";
import { catalogApi, type ParseResult } from "@/entities/item";
import { stockpileApi, type Stockpile, type SyncSource } from "@/entities/stockpile";
import {
  EmptyState,
  ExportBar,
  Field,
  ItemIcon,
  Loading,
  Modal,
  STORAGE_KEYS,
  assetUrl,
  errorText,
  formatDateTime,
  readStorage,
  useConfirm,
  useDocExport,
  useI18n,
  useNotify,
  writeStorage,
  xlsxToText,
  type ExportFormat,
  type PanelMode,
  UiGlyph,
} from "@/shared";

const SOURCE_LABEL: Record<string, string> = {
  json: "JSON",
  txt: "TXT",
  scan: "MapData.sav",
  xlsx: "XLSX",
};

interface StorageMonitorProps {
  can: Can;
  isFullWidth: boolean;
  /** Склад закреплён/обновлён — конструктор берёт гекс и имя для шапки рапорта. */
  onPinned: (stockpile: Stockpile | null) => void;
}

/**
 * «Содержимое закреплённого склада»: выгрузка сканера (JSON/TXT, XLSX, буфер, MapData.sav)
 * разбирается сервером и целиком заменяет содержимое склада клана.
 */
export const StorageMonitor: React.FC<StorageMonitorProps> = ({ can, isFullWidth, onPinned }) => {
  const canItems = can(Scopes.STOCKPILES_ITEMS);
  const notify = useNotify();
  const { t, locale } = useI18n();
  const { media } = useContent();
  const [stockpiles, setStockpiles] = React.useState<Stockpile[]>([]);
  const [pinnedId, setPinnedId] = React.useState<string | null>(null);
  const [pinned, setPinned] = React.useState<Stockpile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [mode, setMode] = React.useState<PanelMode>("export");
  const [query, setQuery] = React.useState("");
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [pasteText, setPasteText] = React.useState("");
  const [editing, setEditing] = React.useState<"create" | "rename" | null>(null);
  const [armed, confirm] = useConfirm();
  const textInput = React.useRef<HTMLInputElement>(null);
  const xlsxInput = React.useRef<HTMLInputElement>(null);
  const savInput = React.useRef<HTMLInputElement>(null);
  const { run: exportDoc, previewModal } = useDocExport(media("bg_report_texture"));

  const loadList = React.useCallback(async () => {
    try {
      const list = await stockpileApi.list();
      setStockpiles(list);
      const saved = readStorage<string | null>(STORAGE_KEYS.pinnedStockpile, null);
      setPinnedId((current) => current ?? (list.some((s) => s.id === saved) ? saved : list[0]?.id ?? null));
    } catch (err) {
      notify({ title: t("stock.stockpiles"), message: errorText(err, t("stock.loadFailed")), tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [notify, t]);

  React.useEffect(() => {
    void loadList();
  }, [loadList]);

  React.useEffect(() => {
    writeStorage(STORAGE_KEYS.pinnedStockpile, pinnedId);
    if (!pinnedId) {
      setPinned(null);
      onPinned(null);
      return;
    }
    let cancelled = false;
    stockpileApi
      .get(pinnedId)
      .then((s) => {
        if (cancelled) return;
        setPinned(s);
        onPinned(s);
      })
      .catch(() => !cancelled && setPinned(null));
    return () => {
      cancelled = true;
    };
  }, [pinnedId, onPinned]);

  const applyParsed = async (result: ParseResult, source: SyncSource) => {
    if (!pinned) return notify({ title: t("stock.stockpile"), message: t("stock.pickFirst"), tone: "warning" });
    if (!result.lines.length) {
      return notify({
        title: t("import.formatError"),
        message: t("import.formatHelp"),
        tone: "danger",
        ttl: 8000,
      });
    }
    const items = result.lines.filter((l) => l.item && l.count > 0).map((l) => ({ item_code: l.item!.code, quantity: l.count }));
    try {
      const saved = await stockpileApi.replaceContents(pinned.id, items, source);
      setPinned(saved.stockpile);
      onPinned(saved.stockpile);
      setStockpiles((prev) => prev.map((s) => (s.id === saved.stockpile.id ? saved.stockpile : s)));
      notify({ title: t("stock.synced"), message: saved.message, tone: "success" });
      if (result.unknown.length) {
        notify({
          title: t("import.notInCatalog"),
          message: `${result.unknown.slice(0, 6).join(" • ")}${result.unknown.length > 6 ? ` • ${t("common.more", { n: result.unknown.length - 6 })}` : ""}`,
          tone: "warning",
          ttl: 9000,
        });
      }
    } catch (err) {
      notify({ title: t("common.database"), message: errorText(err, t("stock.notSaved")), tone: "danger" });
    }
  };

  const importText = async (text: string, source: SyncSource) => {
    setBusy(true);
    try {
      await applyParsed(await catalogApi.parse(text), source);
    } catch (err) {
      notify({ title: t("import.title"), message: errorText(err, t("import.parseFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const readClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return notify({ title: t("export.clipboardTitle"), message: t("import.clipboardEmpty"), tone: "warning" });
      await importText(text, "clipboard");
    } catch {
      setPasteText("");
      setPasteOpen(true);
    }
  };

  const pick = (ref: React.RefObject<HTMLInputElement | null>) => {
    if (!ref.current) return;
    ref.current.value = "";
    ref.current.click();
  };

  const onScan = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await catalogApi.scan(file);
      if (!result.lines.length) {
        notify({ title: t("scan.title"), message: t("scan.nothing", { file: result.fileName, kb: (result.fileSize / 1024).toFixed(0) }), tone: "warning" });
        return;
      }
      notify({ title: t("scan.mapdata"), message: t(result.strict ? "scan.found" : "scan.foundSoft", { file: result.fileName, n: result.matched }), tone: "info" });
      await applyParsed(result, "scan");
    } catch (err) {
      notify({ title: t("scan.title"), message: errorText(err, t("scan.failed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const items = pinned?.items ?? [];
  const itemLabel = (i: { name: string | null; nameEn: string | null; itemCode: string }) => (locale === "ru" ? i.name : i.nameEn ?? i.name) ?? i.itemCode;
  const total = items.reduce((acc, i) => acc + i.quantity, 0);
  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => `${i.name ?? ""} ${i.nameEn ?? ""} ${i.itemCode}`.toLowerCase().includes(q)) : items;
  }, [items, query]);

  const onAction = (fmt: ExportFormat) => {
    if (mode === "import") {
      if (!canItems) return notify({ title: t("common.access"), message: t("stock.membersOnly"), tone: "warning" });
      if (fmt === "txt") pick(textInput);
      else if (fmt === "xlsx") pick(xlsxInput);
      else if (fmt === "clipboard") void readClipboard();
      return;
    }
    void exportDoc(
      {
        title: `SINDARIS • ${t("stock.docTitle")}`,
        header: [`${t("doc.hex")}: ${pinned?.region ?? "—"}`, `${t("doc.stockpile")}: ${pinned?.name ?? "—"}`, `${t("doc.lines")}: ${items.length} • Σ ${total}`],
        sections: [{ rows: items.map((i) => ({ name: itemLabel(i), quantity: i.quantity, unit: t("unit.unit") })) }],
        fileBase: "SINDARIS_stockpile",
        sheetName: t("stock.sheet"),
      },
      fmt,
    );
  };

  return (
    <section data-guide="stock-panel" className="panel panel-corners flex flex-col rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="panel-title">📦 {t("stock.title")}</h2>
        <div className="flex items-center gap-2">
          <span className="badge-count min-w-0 px-2" title={t("doc.lines")}>{t("common.pos", { n: items.length })}</span>
          <span className="badge-count min-w-0 px-2" title={t("common.total")}>Σ {total}</span>
        </div>
      </div>
      <div className="stencil-line mt-2" />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select data-guide="stock-select" className="field w-full flex-1 sm:w-auto" value={pinnedId ?? ""} onChange={(e) => setPinnedId(e.target.value || null)} disabled={loading}>
          {stockpiles.length === 0 && <option value="">{t("stock.none")}</option>}
          {stockpiles.map((s) => (
            <option key={s.id} value={s.id}>
              {s.region} ▶ {s.name}
            </option>
          ))}
        </select>
        {(
          <>
            {can(Scopes.STOCKPILES_CREATE) && <button className="btn" data-guide="stock-new" onClick={() => setEditing("create")} title={t("stock.new")}>＋</button>}
            {can(Scopes.STOCKPILES_EDIT) && <button className="btn" onClick={() => setEditing("rename")} disabled={!pinned} title={t("stock.rename")}>✎</button>}
            {can(Scopes.STOCKPILES_DELETE) && <button
              className={`btn btn-danger ${armed === "delete" ? "btn-active" : ""}`}
              disabled={!pinned}
              title={t("stock.delete")}
              onClick={() =>
                pinned &&
                confirm("delete", async () => {
                  try {
                    await stockpileApi.delete(pinned.id);
                    setStockpiles((prev) => prev.filter((s) => s.id !== pinned.id));
                    setPinnedId(stockpiles.find((s) => s.id !== pinned.id)?.id ?? null);
                    notify({ title: t("stock.stockpile"), message: t("stock.deleted", { name: pinned.name }), tone: "warning" });
                  } catch (err) {
                    notify({ title: t("stock.stockpile"), message: errorText(err, t("stock.deleteFailed")), tone: "danger" });
                  }
                })
              }
            >
              {armed === "delete" ? "?" : "🗑"}
            </button>}
          </>
        )}
      </div>

      {canItems && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button className="btn btn-icon" onClick={() => pick(textInput)} data-guide="stock-load" title={t("stock.loadFile")} disabled={busy || !pinned}>
            <UiGlyph icon="file-json" size={26} />
          </button>
          <button className="btn btn-icon" onClick={() => void readClipboard()} data-guide="stock-paste" title={t("stock.paste")} disabled={busy || !pinned}>
            <UiGlyph icon="clipboard" size={26} />
          </button>
          <button className="btn" onClick={() => pick(savInput)} data-guide="stock-scan" title={t("stock.scanHint")} disabled={busy || !pinned}>
            <span>📡</span>
            <span className="hidden sm:inline">{t("stock.scan")}</span>
            <span className="sm:hidden">.SAV</span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <input className="field w-36 py-1.5 text-xs sm:w-44" data-guide="stock-filter" placeholder={t("stock.filter")} value={query} onChange={(e) => setQuery(e.target.value)} />
            <button
              className={`btn btn-danger px-2 ${armed === "clear" ? "btn-active" : ""}`}
              title={t("stock.clear")}
              disabled={busy || !items.length}
              onClick={() =>
                confirm("clear", () => {
                  void (async () => {
                    setBusy(true);
                    try {
                      const saved = await stockpileApi.replaceContents(pinned!.id, [], "manual");
                      setPinned(saved.stockpile);
                      onPinned(saved.stockpile);
                      notify({ title: t("stock.stockpile"), message: saved.message, tone: "warning" });
                    } catch (err) {
                      notify({ title: t("stock.stockpile"), message: errorText(err, t("stock.clearFailed")), tone: "danger" });
                    } finally {
                      setBusy(false);
                    }
                  })();
                })
              }
            >
              {armed === "clear" ? "?" : "✕"}
            </button>
          </div>
        </div>
      )}

      <div data-guide="stock-sync" className="hud-label mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
        <span>
          {t("stock.sync")}:{" "}
          <span className="text-white/80">
            {pinned?.lastSyncAt ? `${formatDateTime(pinned.lastSyncAt)} • ${SOURCE_LABEL[pinned.lastSyncSource ?? ""] ?? t(pinned.lastSyncSource === "clipboard" ? "stock.srcClipboard" : "stock.srcManual")} • ${t("common.pos", { n: items.length })}` : t("common.noData")}
          </span>
        </span>
        {busy && <span className="pulse text-warn">● {t("common.processing")}</span>}
      </div>

      <div data-guide="stock-list" className="scroll-area panel-inner mt-3 max-h-[46vh] min-h-[200px] flex-1 rounded p-1.5">
        {loading ? (
          <Loading label={t("stock.loading")} />
        ) : !pinned ? (
          <EmptyState icon="crates" title={t("stock.notPicked")} hint={can(Scopes.STOCKPILES_CREATE) ? t("stock.createHint") : t("stock.membersRegister")} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon="crates"
            title={items.length ? t("common.nothingFilter") : t("stock.empty")}
            hint={t("stock.formatHint")}
          />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {visible.map((item) => (
              <li key={item.id} className="row-item">
                <span className="flex min-w-0 items-center gap-2">
                  <ItemIcon sources={[assetUrl(item.iconUrl)]} size={isFullWidth ? 64 : 32} label={itemLabel(item)} />
                  <span className={`truncate text-white ${isFullWidth ? "text-base font-semibold" : "text-[0.82rem]"}`}>• {itemLabel(item)}</span>
                </span>
                <span className="badge-count">{item.quantity}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ExportBar mode={mode} onToggleMode={() => setMode((m) => (m === "export" ? "import" : "export"))} onAction={onAction} busy={busy} />

      <input ref={textInput} type="file" accept=".json,.txt,application/json,text/plain" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void file.text().then((text) => importText(text, file.name.toLowerCase().endsWith(".json") ? "json" : "txt"));
      }} />
      <input ref={xlsxInput} type="file" accept=".xlsx" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void xlsxToText(file).then((text) => importText(text, "xlsx")).catch((err) => notify({ title: "XLSX", message: errorText(err, t("import.xlsxFailed")), tone: "danger" }));
      }} />
      <input ref={savInput} type="file" accept=".sav,application/octet-stream" className="hidden" onChange={(e) => void onScan(e.target.files?.[0])} />

      <Modal open={pasteOpen} onClose={() => setPasteOpen(false)} title={t("import.pasteTitle")} icon="clipboard" widthClass="max-w-lg">
        <p className="hud-label text-muted">{t("import.pasteHelp")}</p>
        <textarea className="field field-mono mt-2 h-48 w-full resize-y text-xs" placeholder={t("import.pastePlaceholder")} value={pasteText} onChange={(e) => setPasteText(e.target.value)} autoFocus />
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn" onClick={() => setPasteOpen(false)}>{t("common.cancel")}</button>
          <button className="btn btn-primary" onClick={() => {
            setPasteOpen(false);
            void importText(pasteText, "clipboard");
          }}>
            {t("import.recognize")}
          </button>
        </div>
      </Modal>

      <StockpileFormModal
        mode={editing}
        stockpile={pinned}
        onClose={() => setEditing(null)}
        onSaved={(s, created) => {
          setStockpiles((prev) => (created ? [...prev, s] : prev.map((p) => (p.id === s.id ? { ...p, name: s.name, region: s.region } : p))));
          if (created) setPinnedId(s.id);
          else setPinned((p) => (p ? { ...p, name: s.name, region: s.region } : p));
        }}
      />
      {previewModal}
    </section>
  );
};

const StockpileFormModal: React.FC<{
  mode: "create" | "rename" | null;
  stockpile: Stockpile | null;
  onClose: () => void;
  onSaved: (s: Stockpile, created: boolean) => void;
}> = ({ mode, stockpile, onClose, onSaved }) => {
  const notify = useNotify();
  const { t } = useI18n();
  const { list } = useContent();
  const [name, setName] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const listId = React.useId();

  React.useEffect(() => {
    if (!mode) return;
    setName(mode === "rename" ? stockpile?.name ?? "" : "");
    setRegion(mode === "rename" ? stockpile?.region ?? "" : "");
  }, [mode, stockpile]);

  const submit = async () => {
    if (!name.trim() || !region.trim()) return;
    setBusy(true);
    try {
      const r = mode === "rename" && stockpile ? await stockpileApi.update(stockpile.id, { name: name.trim(), region: region.trim() }) : await stockpileApi.create(name.trim(), region.trim());
      onSaved(r.stockpile, mode === "create");
      notify({ title: t("stock.stockpile"), message: r.message, tone: "success" });
      onClose();
    } catch (err) {
      notify({ title: t("stock.stockpile"), message: errorText(err, t("stock.saveFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(mode)} onClose={onClose} title={mode === "rename" ? t("stock.rename") : t("stock.newClan")} icon="stockpile" widthClass="max-w-md">
      <div className="grid gap-3">
        <Field label={t("timers.regionHex")} list={listId} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="The Moors" autoFocus />
        <datalist id={listId}>
          {list<{ name: string }>("region").map((r) => (
            <option key={r.key} value={r.payload.name} />
          ))}
        </datalist>
        <Field label={t("stock.name")} value={name} onChange={(e) => setName(e.target.value)} placeholder="Port Kirknell" onKeyDown={(e) => e.key === "Enter" && void submit()} />
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn btn-primary" disabled={busy || !name.trim() || !region.trim()} onClick={() => void submit()}>
            {busy ? t("common.sending") : t("common.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
};
