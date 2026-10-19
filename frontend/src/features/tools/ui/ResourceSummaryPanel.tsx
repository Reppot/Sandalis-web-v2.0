"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { ExportBar, ItemIcon, useDocExport, type ExportDoc } from "@/shared";

export interface SummaryLine {
  name: string;
  quantity: number | string;
  unit: string;
  icon?: string | null;
  note?: string;
}

export interface ToolReport {
  toolName: string;
  subtitle: string;
  fileBase: string;
  items: SummaryLine[];
  resources: SummaryLine[];
  stats: SummaryLine[];
}

export function toolDoc(report: ToolReport): ExportDoc {
  const strip = ({ name, quantity, unit, note }: SummaryLine) => ({ name, quantity, unit, note });
  return {
    title: `SINDARIS • ${report.toolName}`,
    header: [`Инструмент: ${report.toolName}`, `Режим: ${report.subtitle}`, `Позиций: ${report.items.length} • Ресурсов: ${report.resources.length}`],
    sections: [
      { label: `ВЫБРАННЫЕ ПРЕДМЕТЫ • ${report.items.length}`, rows: report.items.map(strip) },
      { label: `ИТОГОВЫЕ РЕСУРСЫ • ${report.resources.length}`, rows: report.resources.map(strip) },
      ...(report.stats.length ? [{ label: "СВОДКА", rows: report.stats.map(strip) }] : []),
    ],
    fileBase: report.fileBase,
    sheetName: "Предметы",
    footer: "SINDARIS LOGISTICS OVERWATCH • РАСЧЁТ ИНСТРУМЕНТОВ КЛАНА",
  };
}

const fmt = (v: number | string) => (typeof v === "number" ? v.toLocaleString("ru-RU") : v);

/**
 * Итоговые ресурсы калькулятора: на телефоне — аккордеон над нижней навигацией,
 * на планшете — карточка в углу, на ПК — липкая правая колонка (как в старом сайте).
 * Не вкладывать внутрь .panel: backdrop-filter ломает position: fixed.
 */
export const ResourceSummaryPanel: React.FC<React.PropsWithChildren<{ report: ToolReport; title: string; emptyHint: string; onClear: () => void }>> = ({ report, title, emptyHint, onClear, children }) => {
  const { media } = useContent();
  const { run, previewModal } = useDocExport(media("bg_report_texture"));
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const count = report.items.length;
  const preview = report.resources.slice(0, 3).map((l) => `${l.name} ${fmt(l.quantity)}`).join(" · ");

  return (
    <aside
      aria-label={`${title}: итоговые ресурсы`}
      className={[
        "panel panel-corners z-[55] flex flex-col rounded-md",
        "fixed inset-x-2 bottom-[5.25rem] max-h-[calc(100dvh-7rem)]",
        "md:right-3 md:bottom-3 md:left-auto md:w-[26rem]",
        "lg:sticky lg:top-0 lg:right-auto lg:bottom-auto lg:left-auto lg:z-auto lg:max-h-[calc(100dvh-9.5rem)] lg:w-auto lg:self-start",
      ].join(" ")}
    >
      <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left lg:hidden" onClick={() => setMobileOpen((o) => !o)} aria-expanded={mobileOpen}>
        <span className="status-dot shrink-0" style={{ color: "var(--accent)", background: "var(--accent)" }} />
        <span className="min-w-0 flex-1">
          <span className="panel-title block truncate">{report.toolName}</span>
          <span className="hud-label mt-0.5 block truncate text-muted">{count ? `${count} поз. • ${preview || "ресурсы не требуются"}` : "Ничего не выбрано"}</span>
        </span>
        <span className="hud-label shrink-0 text-accent">{mobileOpen ? "▼ Свернуть" : "▲ Итоги"}</span>
      </button>

      <div className={`${mobileOpen ? "flex" : "hidden"} min-h-0 flex-1 flex-col overflow-y-auto border-t border-white/10 p-3 lg:flex lg:overflow-hidden lg:border-t-0 lg:p-4`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="panel-title">{title}</div>
            <div className="hud-label mt-1 text-muted">{report.subtitle}</div>
          </div>
          <button type="button" className="btn btn-danger px-2" onClick={onClear} disabled={!count} title="Очистить список">✕</button>
        </div>
        <div className="factory-rule" />
        <div className="factory-plan-list scroll-area min-h-[120px] max-lg:flex-none max-lg:overflow-visible lg:min-h-[140px]">
          {count ? children : <div className="hud-label py-8 text-center text-muted">{emptyHint}</div>}
        </div>
        <div className="factory-totals shrink-0">
          <div className="hud-label mb-2 text-accent">Итоговые ресурсы</div>
          <div className="factory-total-grid">
            {[...report.resources, ...report.stats].map((line) => (
              <div key={`${line.name}-${line.unit}`} className="min-w-0">
                <span className="flex min-w-0 items-center gap-1.5">
                  {line.icon ? <ItemIcon sources={[line.icon]} size={28} label={line.name} /> : null}
                  <span className="hud-label truncate text-muted">{line.name}</span>
                </span>
                <strong className="truncate">{fmt(line.quantity)}</strong>
              </div>
            ))}
          </div>
          <ExportBar title="ЭКСПОРТ РАСЧЁТА" onAction={(f) => void run(toolDoc(report), f)} />
        </div>
      </div>
      {previewModal}
    </aside>
  );
};
