"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { UNIT_LABEL, catalogApi, type ParseResult } from "@/entities/item";
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
  uiIcon,
  useConfirm,
  useDocExport,
  useNotify,
  writeStorage,
  xlsxToText,
  type ExportFormat,
  type PanelMode,
} from "@/shared";

const SOURCE_LABEL: Record<string, string> = {
  json: "JSON",
  txt: "TXT",
  clipboard: "БУФЕР",
  scan: "MapData.sav",
  xlsx: "XLSX",
  manual: "РУЧНОЙ",
};

interface StorageMonitorProps {
  canWrite: boolean;
  isFullWidth: boolean;
  /** Склад закреплён/обновлён — конструктор берёт гекс и имя для шапки рапорта. */
  onPinned: (stockpile: Stockpile | null) => void;
}

/**
 * «Содержимое закреплённого склада»: выгрузка сканера (JSON/TXT, XLSX, буфер, MapData.sav)
 * разбирается сервером и целиком заменяет содержимое склада клана.
 */
export const StorageMonitor: React.FC<StorageMonitorProps> = ({ canWrite, isFullWidth, onPinned }) => {
  const notify = useNotify();
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
      notify({ title: "СКЛАДЫ", message: errorText(err, "Нет связи с базой складов"), tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [notify]);

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
    if (!pinned) return notify({ title: "СКЛАД", message: "Сначала выберите или создайте склад.", tone: "warning" });
    if (!result.lines.length) {
      return notify({
        title: "ОШИБКА ФОРМАТА",
        message: "Не удалось распознать данные сканера. Формат строк:\n\nНазвание Предмета, Количество\nили\nНазвание Предмета -> Количество",
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
      notify({ title: "СИНХРОНИЗАЦИЯ", message: saved.message, tone: "success" });
      if (result.unknown.length) {
        notify({
          title: "НЕ НАЙДЕНЫ В КАТАЛОГЕ",
          message: `${result.unknown.slice(0, 6).join(" • ")}${result.unknown.length > 6 ? ` • ещё ${result.unknown.length - 6}` : ""}`,
          tone: "warning",
          ttl: 9000,
        });
      }
    } catch (err) {
      notify({ title: "БАЗА ДАННЫХ", message: errorText(err, "Склад не сохранён"), tone: "danger" });
    }
  };

  const importText = async (text: string, source: SyncSource) => {
    setBusy(true);
    try {
      await applyParsed(await catalogApi.parse(text), source);
    } catch (err) {
      notify({ title: "ИМПОРТ", message: errorText(err, "Сервер не разобрал отчёт"), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const readClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return notify({ title: "БУФЕР ОБМЕНА", message: "Буфер обмена пуст или не содержит текста!", tone: "warning" });
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
        notify({ title: "СКАНЕР", message: `В файле ${result.fileName} (${(result.fileSize / 1024).toFixed(0)} КБ) не найдено предметов каталога.`, tone: "warning" });
        return;
      }
      notify({ title: "СКАНЕР MAPDATA", message: `${result.fileName}: распознано позиций — ${result.matched}${result.strict ? "" : " (мягкий режим поиска)"}.`, tone: "info" });
      await applyParsed(result, "scan");
    } catch (err) {
      notify({ title: "СКАНЕР", message: errorText(err, "Сбой обработки файла"), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const items = pinned?.items ?? [];
  const total = items.reduce((acc, i) => acc + i.quantity, 0);
  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => `${i.name ?? ""} ${i.itemCode}`.toLowerCase().includes(q)) : items;
  }, [items, query]);

  const onAction = (fmt: ExportFormat) => {
    if (mode === "import") {
      if (!canWrite) return notify({ title: "ДОСТУП", message: "Загружать склад могут бойцы клана.", tone: "warning" });
      if (fmt === "txt") pick(textInput);
      else if (fmt === "xlsx") pick(xlsxInput);
      else if (fmt === "clipboard") void readClipboard();
      return;
    }
    void exportDoc(
      {
        title: "SINDARIS • Запасы склада",
        header: [`Гекс: ${pinned?.region ?? "—"}`, `Склад: ${pinned?.name ?? "—"}`, `Позиций: ${items.length} • Σ ${total}`],
        sections: [{ rows: items.map((i) => ({ name: i.name ?? i.itemCode, quantity: i.quantity, unit: UNIT_LABEL.unit })) }],
        fileBase: "SINDARIS_склад",
        sheetName: "Склад",
      },
      fmt,
    );
  };

  return (
    <section className="panel panel-corners flex flex-col rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="panel-title">📦 Содержимое закреплённого склада</h2>
        <div className="flex items-center gap-2">
          <span className="badge-count min-w-0 px-2" title="Позиций">{items.length} ПОЗ.</span>
          <span className="badge-count min-w-0 px-2" title="Суммарное количество">Σ {total}</span>
        </div>
      </div>
      <div className="stencil-line mt-2" />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className="field w-full flex-1 sm:w-auto" value={pinnedId ?? ""} onChange={(e) => setPinnedId(e.target.value || null)} disabled={loading}>
          {stockpiles.length === 0 && <option value="">— складов нет —</option>}
          {stockpiles.map((s) => (
            <option key={s.id} value={s.id}>
              {s.region} ▶ {s.name}
            </option>
          ))}
        </select>
        {canWrite && (
          <>
            <button className="btn" onClick={() => setEditing("create")} title="Новый склад">＋</button>
            <button className="btn" onClick={() => setEditing("rename")} disabled={!pinned} title="Переименовать склад">✎</button>
            <button
              className={`btn btn-danger ${armed === "delete" ? "btn-active" : ""}`}
              disabled={!pinned}
              title="Удалить склад со всеми позициями"
              onClick={() =>
                pinned &&
                confirm("delete", async () => {
                  try {
                    await stockpileApi.delete(pinned.id);
                    setStockpiles((prev) => prev.filter((s) => s.id !== pinned.id));
                    setPinnedId(stockpiles.find((s) => s.id !== pinned.id)?.id ?? null);
                    notify({ title: "СКЛАД", message: `Склад «${pinned.name}» удалён.`, tone: "warning" });
                  } catch (err) {
                    notify({ title: "СКЛАД", message: errorText(err, "Не удалось удалить склад"), tone: "danger" });
                  }
                })
              }
            >
              {armed === "delete" ? "?" : "🗑"}
            </button>
          </>
        )}
      </div>

      {canWrite && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button className="btn btn-icon" onClick={() => pick(textInput)} title="ЗАГРУЗИТЬ JSON/TXT СКАНЕРА" disabled={busy || !pinned}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={uiIcon("json")} alt="JSON" width={26} height={26} className="ui-icon" />
          </button>
          <button className="btn btn-icon" onClick={() => void readClipboard()} title="ВСТАВИТЬ ИЗ БУФЕРА ОБМЕНА" disabled={busy || !pinned}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={uiIcon("log-file")} alt="LOG" width={26} height={26} className="ui-icon" />
          </button>
          <button className="btn" onClick={() => pick(savInput)} title="Загрузить MapData.sav и распознать предметы" disabled={busy || !pinned}>
            <span>📡</span>
            <span className="hidden sm:inline">Сканировать файл</span>
            <span className="sm:hidden">.SAV</span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <input className="field w-36 py-1.5 text-xs sm:w-44" placeholder="Фильтр склада..." value={query} onChange={(e) => setQuery(e.target.value)} />
            <button
              className={`btn btn-danger px-2 ${armed === "clear" ? "btn-active" : ""}`}
              title="Очистить содержимое склада"
              disabled={busy || !items.length}
              onClick={() =>
                confirm("clear", () => {
                  void (async () => {
                    setBusy(true);
                    try {
                      const saved = await stockpileApi.replaceContents(pinned!.id, [], "manual");
                      setPinned(saved.stockpile);
                      onPinned(saved.stockpile);
                      notify({ title: "СКЛАД", message: saved.message, tone: "warning" });
                    } catch (err) {
                      notify({ title: "СКЛАД", message: errorText(err, "Не удалось очистить склад"), tone: "danger" });
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

      <div className="hud-label mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
        <span>
          Синхр:{" "}
          <span className="text-white/80">
            {pinned?.lastSyncAt ? `${formatDateTime(pinned.lastSyncAt)} • ${SOURCE_LABEL[pinned.lastSyncSource ?? ""] ?? pinned.lastSyncSource} • ${items.length} поз.` : "нет данных"}
          </span>
        </span>
        {busy && <span className="pulse text-warn">● ОБРАБОТКА...</span>}
      </div>

      <div className="scroll-area panel-inner mt-3 max-h-[46vh] min-h-[200px] flex-1 rounded p-1.5">
        {loading ? (
          <Loading label="📡 ЗАПРОС ДАННЫХ СКЛАДА..." />
        ) : !pinned ? (
          <EmptyState icon={uiIcon("pallets")} title="Склад не выбран" hint={canWrite ? "Создайте склад кнопкой ＋" : "Склады регистрируют бойцы и офицеры клана"} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={uiIcon("pallets")}
            title={items.length ? "Ничего не найдено по фильтру" : "Склад пуст. Загрузите JSON/TXT, вставьте данные из буфера или просканируйте MapData.sav"}
            hint="Формат строк: «Название предмета, 50» или «Название предмета -> 50»"
          />
        ) : (
          <ul className="flex flex-col gap-0.5">
            {visible.map((item) => (
              <li key={item.id} className="row-item">
                <span className="flex min-w-0 items-center gap-2">
                  <ItemIcon sources={[assetUrl(item.iconUrl)]} size={isFullWidth ? 64 : 32} label={item.name ?? item.itemCode} />
                  <span className={`truncate text-white ${isFullWidth ? "text-base font-semibold" : "text-[0.82rem]"}`}>• {item.name ?? item.itemCode}</span>
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
        if (file) void file.text().then((t) => importText(t, file.name.toLowerCase().endsWith(".json") ? "json" : "txt"));
      }} />
      <input ref={xlsxInput} type="file" accept=".xlsx" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void xlsxToText(file).then((t) => importText(t, "xlsx")).catch((err) => notify({ title: "XLSX", message: errorText(err, "Сбой чтения таблицы"), tone: "danger" }));
      }} />
      <input ref={savInput} type="file" accept=".sav,application/octet-stream" className="hidden" onChange={(e) => void onScan(e.target.files?.[0])} />

      <Modal open={pasteOpen} onClose={() => setPasteOpen(false)} title="Вставка данных сканера" icon={uiIcon("log-file")} widthClass="max-w-lg">
        <p className="hud-label text-muted">Браузер не дал прямой доступ к буферу. Вставьте текст вручную (Ctrl+V):</p>
        <textarea className="field field-mono mt-2 h-48 w-full resize-y text-xs" placeholder={"Название предмета, 50\nНазвание предмета -> 12 ящ.\nНазвание предмета: 7"} value={pasteText} onChange={(e) => setPasteText(e.target.value)} autoFocus />
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn" onClick={() => setPasteOpen(false)}>Отмена</button>
          <button className="btn btn-primary" onClick={() => {
            setPasteOpen(false);
            void importText(pasteText, "clipboard");
          }}>
            Распознать
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
      notify({ title: "СКЛАД", message: r.message, tone: "success" });
      onClose();
    } catch (err) {
      notify({ title: "СКЛАД", message: errorText(err, "Не удалось сохранить склад"), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(mode)} onClose={onClose} title={mode === "rename" ? "Переименовать склад" : "Новый склад клана"} icon={uiIcon("barracks")} widthClass="max-w-md">
      <div className="grid gap-3">
        <Field label="Регион / гекс" list={listId} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="The Moors" autoFocus />
        <datalist id={listId}>
          {list<{ name: string }>("region").map((r) => (
            <option key={r.key} value={r.payload.name} />
          ))}
        </datalist>
        <Field label="Название склада" value={name} onChange={(e) => setName(e.target.value)} placeholder="Порт Kirknell" onKeyDown={(e) => e.key === "Enter" && void submit()} />
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" disabled={busy || !name.trim() || !region.trim()} onClick={() => void submit()}>
            {busy ? "ПЕРЕДАЧА..." : "Сохранить"}
          </button>
        </div>
      </div>
    </Modal>
  );
};
