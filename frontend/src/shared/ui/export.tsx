"use client";

import * as React from "react";
import type { UiIcon } from "@/shared/config/assets";
import { UiGlyph } from "@/shared/ui/glyph";
import { useT, type MessageKey, type Translate } from "@/shared/i18n";
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
  type ExportLabels,
} from "@/shared/lib/exporters";
import { fileStamp } from "@/shared/lib/time";
import { Modal } from "@/shared/ui/modal";
import { useNotify } from "@/shared/ui/notify";

export type ExportFormat = "txt" | "xlsx" | "png" | "clipboard";
export type PanelMode = "export" | "import";

const FORMATS: { fmt: ExportFormat; label: MessageKey; icon: UiIcon; importable: boolean; hintExport: MessageKey; hintImport: MessageKey }[] = [
  { fmt: "txt", label: "export.fmt.txt", icon: "file-txt", importable: true, hintExport: "export.hint.txt", hintImport: "export.hint.txtImport" },
  { fmt: "xlsx", label: "export.fmt.xlsx", icon: "file-xlsx", importable: true, hintExport: "export.hint.xlsx", hintImport: "export.hint.xlsxImport" },
  { fmt: "png", label: "export.fmt.png", icon: "file-png", importable: false, hintExport: "export.hint.png", hintImport: "export.hint.pngImport" },
  { fmt: "clipboard", label: "export.fmt.clipboard", icon: "clipboard", importable: true, hintExport: "export.hint.clipboard", hintImport: "export.hint.clipboardImport" },
];

/** Подписи файлов экспорта на текущем языке. */
export function exportLabels(t: Translate): ExportLabels {
  return {
    generated: t("export.file.generated"),
    page: t("export.file.page"),
    sheet: t("export.file.sheet"),
    name: t("export.file.name"),
    quantity: t("export.file.quantity"),
    unit: t("export.file.unit"),
    footer: t("export.file.footer"),
  };
}

interface ExportBarProps {
  onAction: (fmt: ExportFormat) => void;
  busy?: boolean;
  /** Без mode — только экспорт (калькуляторы, рапорты). */
  mode?: PanelMode;
  onToggleMode?: () => void;
  title?: string;
}

export const ExportBar: React.FC<ExportBarProps> = ({ onAction, busy, mode, onToggleMode, title }) => {
  const t = useT();
  const isImport = mode === "import";
  return (
    <div className="mt-3 flex flex-col gap-2">
      {mode && onToggleMode ? (
        <button className={`btn w-full justify-between ${isImport ? "btn-warn btn-active" : ""}`} data-guide="export-mode" onClick={onToggleMode} title={t("export.toggleHint")}>
          <span className="flex items-center gap-2">
            <span className={`status-dot ${isImport ? "pulse" : ""}`} style={{ color: isImport ? "var(--warn)" : "var(--accent)", background: isImport ? "var(--warn)" : "var(--accent)" }} />
            {isImport ? t("export.modeImport") : t("export.modeExport")}
          </span>
          <span className="hud-label opacity-70">{isImport ? t("export.modeImportHint") : t("export.modeExportHint")}</span>
        </button>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="hud-label flex items-center gap-2 text-accent">
            <span className="status-dot" style={{ color: "var(--accent)", background: "var(--accent)" }} />
            {title ?? t("export.title")}
          </span>
          <span className="hud-label opacity-70">{t("export.upload")}</span>
        </div>
      )}
      <div data-guide="export-formats" className="grid grid-cols-4 gap-2">
        {FORMATS.map((f) => (
          <button
            key={f.fmt}
            type="button"
            className="btn h-[42px] px-1"
            disabled={busy || (isImport && !f.importable)}
            onClick={() => onAction(f.fmt)}
            title={t(isImport ? f.hintImport : f.hintExport)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <UiGlyph icon={f.icon} size={22} />
            <span className="hidden sm:inline">{t(f.label)}</span>
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
  const t = useT();
  const [preview, setPreview] = React.useState<ExportDoc | null>(null);

  const run = React.useCallback(
    async (input: ExportDoc, fmt: ExportFormat) => {
      const doc: ExportDoc = { ...input, labels: input.labels ?? exportLabels(t) };
      const rows = doc.sections.reduce((n, s) => n + s.rows.length, 0);
      if (!rows) {
        notify({ title: t("export.emptyTitle"), message: t("export.empty"), tone: "warning" });
        return;
      }
      if (fmt === "txt") {
        exportTxt(doc);
        notify({ title: t("export.txtTitle"), message: t("export.txtDone", { n: rows }), tone: "success" });
      } else if (fmt === "xlsx") {
        await exportXlsx(doc);
        notify({ title: t("export.xlsxTitle"), message: t("export.xlsxDone"), tone: "success" });
      } else if (fmt === "png") {
        setPreview(doc);
      } else {
        const [first] = await renderPages(doc, textureUrl);
        const blob = first ? await canvasToBlob(first) : null;
        if (blob && (await copyBlobToClipboard(blob))) {
          notify({ title: t("export.fastShare"), message: t("export.copiedImage"), tone: "success" });
        } else if (await copyText(buildTxt(doc))) {
          notify({ title: t("export.clipboardTitle"), message: t("export.copiedText"), tone: "warning" });
        } else {
          notify({ title: t("export.clipboardTitle"), message: t("export.clipboardUnavailable"), tone: "danger" });
        }
      }
    },
    [notify, textureUrl, t],
  );

  const previewModal = <PagesPreviewModal doc={preview} textureUrl={textureUrl} onClose={() => setPreview(null)} />;
  return { run, previewModal };
}

const PagesPreviewModal: React.FC<{ doc: ExportDoc | null; textureUrl: string | null | undefined; onClose: () => void }> = ({ doc, textureUrl, onClose }) => {
  const notify = useNotify();
  const t = useT();
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
  const pageLabel = doc.labels?.page ?? t("export.file.page");
  const name = (i: number, total: number) => `${fileStamp()}_${doc.fileBase}_${i + 1}_${total}.png`.replace(/[^\wа-яА-ЯёЁ.-]+/g, "_");

  const downloadAll = async () => {
    if (!ready) return;
    for (let i = 0; i < ready.canvases.length; i++) {
      const blob = await canvasToBlob(ready.canvases[i]);
      if (blob) downloadBlob(blob, name(i, ready.canvases.length));
      await new Promise((r) => window.setTimeout(r, 350));
    }
    notify({ title: t("export.pagingTitle"), message: t("export.pagingDone", { n: ready.canvases.length }), tone: "success" });
  };

  const copyPage = async (i: number) => {
    const blob = ready ? await canvasToBlob(ready.canvases[i]) : null;
    const ok = blob ? await copyBlobToClipboard(blob) : false;
    notify(
      ok
        ? { title: t("export.fastShare"), message: t("export.copiedPage", { n: i + 1 }), tone: "success" }
        : { title: t("export.clipboardTitle"), message: t("export.copyPageDenied"), tone: "warning" },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("export.previewTitle", { n: ready?.canvases.length ?? "…" })}
      icon="file-png"
      widthClass="max-w-4xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="hud-label text-muted">{t("export.previewHint")}</span>
          <div className="flex gap-2">
            <button className="btn" onClick={onClose}>{t("common.close")}</button>
            <button className="btn btn-primary" onClick={() => void downloadAll()} disabled={!ready}>{t("export.downloadAll")}</button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!ready ? (
          <div className="hud-label pulse col-span-full py-10 text-center text-muted">{t("export.rendering")}</div>
        ) : (
          ready.urls.map((url, i) => (
            <figure key={i} className="panel-inner flex flex-col gap-2 rounded p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`${pageLabel} ${i + 1}`} className="w-full rounded border border-white/10" />
              <figcaption className="flex items-center justify-between gap-2">
                <span className="hud-label text-muted">{pageLabel} {i + 1}/{ready.urls.length}</span>
                <span className="flex gap-1">
                  <button className="btn px-2 py-1" onClick={() => void copyPage(i)} title={t("export.toClipboard")}>📋</button>
                  <button
                    className="btn px-2 py-1"
                    title={t("export.downloadPng")}
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
