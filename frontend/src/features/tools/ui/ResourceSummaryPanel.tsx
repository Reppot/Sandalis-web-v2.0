"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { ExportBar, ItemIcon, useDocExport, useI18n, type ExportDoc, type Translate } from "@/shared";

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
  /** Отдельные блоки под итогами (например, электроэнергия калькулятора завода). */
  sections?: { title: string; lines: SummaryLine[] }[];
}

export function toolDoc(report: ToolReport, t: Translate): ExportDoc {
  const strip = ({ name, quantity, unit, note, icon }: SummaryLine) => ({ name, quantity, unit, note, icon });
  return {
    title: `SINDARIS • ${report.toolName}`,
    header: [`${t("tools.doc.tool")}: ${report.toolName}`, `${t("tools.doc.mode")}: ${report.subtitle}`, `${t("doc.lines")}: ${report.items.length} • ${t("tools.doc.resources")}: ${report.resources.length}`],
    sections: [
      { label: `${t("tools.doc.selected")} • ${report.items.length}`, rows: report.items.map(strip) },
      { label: `${t("tools.doc.totals")} • ${report.resources.length}`, rows: report.resources.map(strip) },
      ...(report.stats.length ? [{ label: t("tools.doc.summary"), rows: report.stats.map(strip) }] : []),
      ...(report.sections ?? []).filter((x) => x.lines.length).map((x) => ({ label: x.title, rows: x.lines.map(strip) })),
    ],
    fileBase: report.fileBase,
    sheetName: t("tools.doc.sheet"),
    footer: `SINDARIS LOGISTICS OVERWATCH • ${t("tools.doc.footer")}`,
  };
}


/**
 * Итоговые ресурсы калькулятора: на телефоне — аккордеон над нижней навигацией,
 * на планшете — карточка в углу, на ПК — липкая правая колонка (как в старом сайте).
 * Не вкладывать внутрь .panel: backdrop-filter ломает position: fixed.
 */
/** hidden — окно свёрнуто; inline — единственное окно на странице: обычный блок на всю ширину
 *  (без плавающей карточки на телефоне/планшете). */
export const ResourceSummaryPanel: React.FC<React.PropsWithChildren<{ report: ToolReport; title: string; emptyHint: string; onClear: () => void; hidden?: boolean; inline?: boolean }>> = ({ report, title, emptyHint, onClear, hidden, inline, children }) => {
  const { t, dateLocale } = useI18n();
  const fmt = (v: number | string) => (typeof v === "number" ? v.toLocaleString(dateLocale) : v);
  const { media } = useContent();
  const { run, previewModal } = useDocExport(media("bg_report_texture"));
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const count = report.items.length;
  const preview = report.resources.slice(0, 3).map((l) => `${l.name} ${fmt(l.quantity)}`).join(" · ");

  return (
    <aside
      aria-label={`${title}: ${t("tools.totals")}`}
      hidden={hidden}
      className={(inline
        ? ["panel panel-corners flex w-full flex-col rounded-md"]
        : [
            "panel panel-corners z-[55] flex flex-col rounded-md",
            "fixed inset-x-2 bottom-[5.25rem] max-h-[calc(100dvh-7rem)]",
            "md:right-3 md:bottom-3 md:left-auto md:w-[26rem]",
            "lg:sticky lg:top-[calc(var(--chrome-h,72px)+0.75rem)] lg:right-auto lg:bottom-auto lg:left-auto lg:z-auto lg:max-h-[calc(100dvh-var(--chrome-h,72px)-2.25rem)] lg:w-auto lg:self-start",
          ]
      ).join(" ")}
    >
      <button type="button" className={`flex w-full items-center gap-3 px-3 py-2.5 text-left lg:hidden ${inline ? "hidden" : ""}`} onClick={() => setMobileOpen((o) => !o)} aria-expanded={mobileOpen}>
        <span className="status-dot shrink-0" style={{ color: "var(--accent)", background: "var(--accent)" }} />
        <span className="min-w-0 flex-1">
          <span className="panel-title block truncate">{report.toolName}</span>
          <span className="hud-label mt-0.5 block truncate text-muted">{count ? `${t("common.pos", { n: count })} • ${preview || t("tools.noResources")}` : t("tools.nothingSelected")}</span>
        </span>
        <span className="hud-label shrink-0 text-accent">{mobileOpen ? `▼ ${t("tools.collapse")}` : `▲ ${t("tools.results")}`}</span>
      </button>

      <div className={`${mobileOpen || inline ? "flex" : "hidden"} min-h-0 flex-1 flex-col overflow-y-auto border-t border-white/10 p-3 lg:flex lg:overflow-hidden lg:border-t-0 lg:p-4`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="panel-title">{title}</div>
            <div className="hud-label mt-1 text-muted">{report.subtitle}</div>
          </div>
          <button type="button" className="btn btn-danger px-2" onClick={onClear} disabled={!count} title={t("tools.clearList")}>✕</button>
        </div>
        <div className="factory-rule" />
        <div className="factory-plan-list scroll-area min-h-[120px] max-lg:flex-none max-lg:overflow-visible lg:min-h-[140px]">
          {count ? children : <div className="hud-label py-8 text-center text-muted">{emptyHint}</div>}
        </div>
        <div className="factory-totals shrink-0">
          <div data-guide="tool-totals" className="hud-label mb-2 text-accent">{t("tools.totals")}</div>
          <div className="factory-totals-scroll scroll-area">
            {[
              { title: null, lines: report.resources },
              { title: report.resources.length ? t("tools.doc.summary") : null, lines: report.stats },
              ...(report.sections ?? []).map((x) => ({ title: x.title, lines: x.lines, own: true })),
            ].map((group, gi) =>
              group.lines.length ? (
                <React.Fragment key={gi}>
                  {group.title ? <div className={`hud-label mt-3 mb-2 ${"own" in group ? "summary-section-title" : "text-muted"}`}>{group.title}</div> : null}
                  <div className="factory-total-grid">
                    {group.lines.map((line) => (
                      <div key={`${line.name}-${line.unit}`} className="min-w-0" title={line.name}>
                        <span className="flex min-w-0 items-center gap-1.5">
                          {line.icon ? <ItemIcon sources={[line.icon]} size={28} label={line.name} /> : null}
                          <span className="hud-label truncate text-muted">{line.name}</span>
                        </span>
                        <strong className="truncate">{fmt(line.quantity)}{line.unit && typeof line.quantity === "number" && "own" in group ? ` ${line.unit}` : ""}</strong>
                        {line.note ? <span className="summary-note">{line.note}</span> : null}
                      </div>
                    ))}
                  </div>
                </React.Fragment>
              ) : null,
            )}
          </div>
          <ExportBar title={t("tools.exportTitle")} onAction={(f) => void run(toolDoc(report, t), f)} />
        </div>
      </div>
      {previewModal}
    </aside>
  );
};
