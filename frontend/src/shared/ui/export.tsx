"use client";

import * as React from "react";
import { uiIcon } from "@/shared/config/assets";
import {
  buildTxt,
  canvasToBlob,
  copyBlobToClipboard,
  copyText,
  downloadBlob,
  exportTxt,
  exportXlsx,
  renderPages,
  type ExportDoc,
} from "@/shared/lib/exporters";
import { fileStamp } from "@/shared/lib/time";
import { Modal } from "@/shared/ui/modal";
import { useNotify } from "@/shared/ui/notify";

export type ExportFormat = "txt" | "xlsx" | "png" | "clipboard";
export type PanelMode = "export" | "import";

const FORMATS: { fmt: ExportFormat; label: string; icon: string; importable: boolean; hintExport: string; hintImport: string }[] = [
  { fmt: "txt", label: "TXT", icon: uiIcon("txt-file"), importable: true, hintExport: "Выгрузить рапорт в TXT", hintImport: "Загрузить JSON/TXT отчёт сканера" },
  { fmt: "xlsx", label: "XLSX", icon: uiIcon("xls"), importable: true, hintExport: "Выгрузить таблицу XLSX", hintImport: "Загрузить таблицу XLSX" },
  { fmt: "png", label: "PNG", icon: uiIcon("png-file"), importable: false, hintExport: "Сформировать графические страницы", hintImport: "Импорт из PNG недоступен" },
  { fmt: "clipboard", label: "БУФЕР", icon: uiIcon("log-file"), importable: true, hintExport: "Скопировать первую страницу в буфер обмена", hintImport: "Вставить данные из буфера обмена" },
];

interface ExportBarProps {
  onAction: (fmt: ExportFormat) => void;
  busy?: boolean;
  /** Без mode — только экспорт (калькуляторы, рапорты). */
  mode?: PanelMode;
  onToggleMode?: () => void;
  title?: string;
}

export const ExportBar: React.FC<ExportBarProps> = ({ onAction, busy, mode, onToggleMode, title = "ЭКСПОРТ РАПОРТА" }) => {
  const isImport = mode === "import";
  return (
    <div className="mt-3 flex flex-col gap-2">
      {mode && onToggleMode ? (
        <button className={`btn w-full justify-between ${isImport ? "btn-warn btn-active" : ""}`} onClick={onToggleMode} title="Переключить режим панели">
          <span className="flex items-center gap-2">
            <span className={`status-dot ${isImport ? "pulse" : ""}`} style={{ color: isImport ? "var(--warn)" : "var(--accent)", background: isImport ? "var(--warn)" : "var(--accent)" }} />
            {isImport ? "РЕЖИМ: ИМПОРТ ДАННЫХ" : "РЕЖИМ: ЭКСПОРТ ДАННЫХ"}
          </span>
          <span className="hud-label opacity-70">{isImport ? "⬇ чтение файлов" : "⬆ выгрузка рапортов"}</span>
        </button>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="hud-label flex items-center gap-2 text-accent">
            <span className="status-dot" style={{ color: "var(--accent)", background: "var(--accent)" }} />
            {title}
          </span>
          <span className="hud-label opacity-70">⬆ выгрузка</span>
        </div>
      )}
      <div className="grid grid-cols-4 gap-2">
        {FORMATS.map((f) => (
          <button
            key={f.fmt}
            type="button"
            className="btn h-[42px] px-1"
            disabled={busy || (isImport && !f.importable)}
            onClick={() => onAction(f.fmt)}
            title={isImport ? f.hintImport : f.hintExport}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.icon} alt="" width={22} height={22} className="ui-icon h-[22px] w-[22px] object-contain" />
            <span className="hidden sm:inline">{f.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * Выполнить экспорт документа: TXT/XLSX скачиваются, PNG открывает превью страниц,
 * БУФЕР копирует первую страницу (или текст, если браузер не дал записать картинку).
 */
export function useDocExport(textureUrl: string | null | undefined) {
  const notify = useNotify();
  const [preview, setPreview] = React.useState<ExportDoc | null>(null);

  const run = React.useCallback(
    async (doc: ExportDoc, fmt: ExportFormat) => {
      const rows = doc.sections.reduce((n, s) => n + s.rows.length, 0);
      if (!rows) {
        notify({ title: "ПУСТЫЕ ДАННЫЕ", message: "Нет элементов для формирования рапорта!", tone: "warning" });
        return;
      }
      if (fmt === "txt") {
        exportTxt(doc);
        notify({ title: "ЭКСПОРТ TXT", message: `Рапорт из ${rows} позиций сформирован.`, tone: "success" });
      } else if (fmt === "xlsx") {
        await exportXlsx(doc);
        notify({ title: "ЭКСПОРТ XLSX", message: "Таблица сформирована!", tone: "success" });
      } else if (fmt === "png") {
        setPreview(doc);
      } else {
        const [first] = await renderPages(doc, textureUrl);
        const blob = first ? await canvasToBlob(first) : null;
        if (blob && (await copyBlobToClipboard(blob))) {
          notify({ title: "FAST SHARE", message: "Первая страница скопирована — вставляйте в Discord через Ctrl+V!", tone: "success" });
        } else if (await copyText(buildTxt(doc))) {
          notify({ title: "БУФЕР ОБМЕНА", message: "Браузер не разрешил копировать изображение — рапорт скопирован текстом.", tone: "warning" });
        } else {
          notify({ title: "БУФЕР ОБМЕНА", message: "Буфер обмена недоступен в этом браузере.", tone: "danger" });
        }
      }
    },
    [notify, textureUrl],
  );

  const previewModal = <PagesPreviewModal doc={preview} textureUrl={textureUrl} onClose={() => setPreview(null)} />;
  return { run, previewModal };
}

const PagesPreviewModal: React.FC<{ doc: ExportDoc | null; textureUrl: string | null | undefined; onClose: () => void }> = ({ doc, textureUrl, onClose }) => {
  const notify = useNotify();
  const [pages, setPages] = React.useState<{ doc: ExportDoc; urls: string[]; canvases: HTMLCanvasElement[] } | null>(null);
  const ready = pages && pages.doc === doc ? pages : null;

  React.useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    void renderPages(doc, textureUrl).then((canvases) => {
      if (!cancelled) setPages({ doc, canvases, urls: canvases.map((c) => c.toDataURL("image/png")) });
    });
    return () => {
      cancelled = true;
    };
  }, [doc, textureUrl]);

  if (!doc) return null;
  const name = (i: number, total: number) => `${fileStamp()}_${doc.fileBase}_Стр_${i + 1}_из_${total}.png`.replace(/[^\wа-яА-ЯёЁ.-]+/g, "_");

  const downloadAll = async () => {
    if (!ready) return;
    for (let i = 0; i < ready.canvases.length; i++) {
      const blob = await canvasToBlob(ready.canvases[i]);
      if (blob) downloadBlob(blob, name(i, ready.canvases.length));
      await new Promise((r) => window.setTimeout(r, 350));
    }
    notify({ title: "ПЕЙДЖИНГ ЗАВЕРШЁН", message: `Страниц выгружено: ${ready.canvases.length}`, tone: "success" });
  };

  const copyPage = async (i: number) => {
    const blob = ready ? await canvasToBlob(ready.canvases[i]) : null;
    const ok = blob ? await copyBlobToClipboard(blob) : false;
    notify(
      ok
        ? { title: "FAST SHARE", message: `Страница ${i + 1} скопирована — вставляйте в Discord через Ctrl+V!`, tone: "success" }
        : { title: "БУФЕР ОБМЕНА", message: "Браузер не разрешил копирование изображения. Скачайте PNG.", tone: "warning" },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Графический рапорт • ${ready?.canvases.length ?? "…"} стр.`}
      icon={uiIcon("png-file")}
      widthClass="max-w-4xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="hud-label text-muted">Страницы 650×1000 px • до 14 строк на лист</span>
          <div className="flex gap-2">
            <button className="btn" onClick={onClose}>Закрыть</button>
            <button className="btn btn-primary" onClick={() => void downloadAll()} disabled={!ready}>⬇ Скачать все страницы</button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!ready ? (
          <div className="hud-label pulse col-span-full py-10 text-center text-muted">РЕНДЕРИНГ СТРАНИЦ...</div>
        ) : (
          ready.urls.map((url, i) => (
            <figure key={i} className="panel-inner flex flex-col gap-2 rounded p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Страница ${i + 1}`} className="w-full rounded border border-white/10" />
              <figcaption className="flex items-center justify-between gap-2">
                <span className="hud-label text-muted">Стр. {i + 1}/{ready.urls.length}</span>
                <span className="flex gap-1">
                  <button className="btn px-2 py-1" onClick={() => void copyPage(i)} title="В буфер обмена">📋</button>
                  <button
                    className="btn px-2 py-1"
                    title="Скачать PNG"
                    onClick={async () => {
                      const blob = await canvasToBlob(ready.canvases[i]);
                      if (blob) downloadBlob(blob, name(i, ready.canvases.length));
                    }}
                  >
                    ⬇
                  </button>
                </span>
              </figcaption>
            </figure>
          ))
        )}
      </div>
    </Modal>
  );
};
