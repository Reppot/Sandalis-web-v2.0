"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { ExportBar, Hint, Icon, ItemIcon, useDocExport, useI18n, type ExportDoc, type Translate } from "@/shared";

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
    title: `Chronomancer • ${report.toolName}`,
    header: [`${t("tools.doc.tool")}: ${report.toolName}`, `${t("tools.doc.mode")}: ${report.subtitle}`, `${t("doc.lines")}: ${report.items.length} • ${t("tools.doc.resources")}: ${report.resources.length}`],
    sections: [
      { label: `${t("tools.doc.selected")} • ${report.items.length}`, rows: report.items.map(strip) },
      { label: `${t("tools.doc.totals")} • ${report.resources.length}`, rows: report.resources.map(strip) },
      ...(report.stats.length ? [{ label: t("tools.doc.summary"), rows: report.stats.map(strip) }] : []),
      ...(report.sections ?? []).filter((x) => x.lines.length).map((x) => ({ label: x.title, rows: x.lines.map(strip) })),
    ],
    fileBase: report.fileBase,
    sheetName: t("tools.doc.sheet"),
    footer: `Chronomancer • ${t("tools.doc.footer")}`,
  };
}


/**
 * Итоговые ресурсы калькулятора: на телефоне — аккордеон над нижней навигацией,
 * на планшете — карточка в углу, на ПК — липкая правая колонка (как в старом сайте).
 * Не вкладывать внутрь .panel: backdrop-filter ломает position: fixed.
 */
/** hidden — окно свёрнуто; inline — единственное окно на странице: обычный блок на всю ширину
 *  (без плавающей карточки на телефоне/планшете). */
export const ResourceSummaryPanel: React.FC<React.PropsWithChildren<{ report: ToolReport; title: string; emptyHint: string; onClear: () => void; hidden?: boolean; inline?: boolean; totalsHint?: string }>> = ({ report, title, emptyHint, onClear, hidden, inline, totalsHint, children }) => {
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
        ? ["panel flex w-full flex-col"]
        : [
            "panel summary-dock z-[55] flex flex-col",
            "fixed inset-x-2 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] max-h-[calc(100dvh-8rem)]",
            "md:right-4 md:bottom-4 md:left-auto md:w-[26rem]",
            "lg:sticky lg:top-[calc(var(--topbar-h)+1.25rem)] lg:right-auto lg:bottom-auto lg:left-auto lg:z-auto lg:max-h-[calc(100dvh-var(--topbar-h)-2.5rem)] lg:w-auto lg:self-start",
          ]
      ).join(" ")}
    >
      <button type="button" className={`flex w-full items-center gap-3 px-4 py-3 text-left lg:hidden ${inline ? "hidden" : ""}`} onClick={() => setMobileOpen((o) => !o)} aria-expanded={mobileOpen}>
        <span className="count-pill shrink-0">{count}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.95rem] font-semibold">{report.toolName}</span>
          <span className="mt-0.5 block truncate text-xs text-fg-3">{count ? preview || t("tools.noResources") : t("tools.nothingSelected")}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-accent">
          {mobileOpen ? t("tools.collapse") : t("tools.results")}
          <Icon name="chevronDown" size={16} className={mobileOpen ? "" : "rotate-180"} />
        </span>
      </button>

      <div className={`${mobileOpen || inline ? "flex" : "hidden"} min-h-0 flex-1 flex-col overflow-y-auto border-t border-line p-4 lg:flex lg:overflow-hidden lg:border-t-0 lg:p-5`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="panel-title">{title}</div>
            <div className="mt-0.5 text-xs text-fg-3">{report.subtitle}</div>
          </div>
          <button type="button" className="btn btn-ghost h-8 min-h-0 px-2.5 text-[0.8rem] text-danger" onClick={onClear} disabled={!count} title={t("tools.clearList")}>
            {t("common.clear")}
          </button>
        </div>
        <div className="factory-rule" />
        <div className="factory-plan-list scroll-area min-h-[120px] max-lg:flex-none max-lg:overflow-visible lg:min-h-[140px]">
          {count ? children : (
            <div className="summary-empty">
              <span className="summary-empty-icon" aria-hidden><Icon name="plus" size={20} /></span>
              <span>{emptyHint}</span>
            </div>
          )}
        </div>
        <div className="factory-totals shrink-0">
          <div data-guide="tool-totals" className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">{t("tools.totals")}{totalsHint ? <Hint>{totalsHint}</Hint> : null}</div>
          <div className="factory-totals-scroll scroll-area">
            {[
              { title: null, lines: report.resources },
              { title: report.resources.length ? t("tools.doc.summary") : null, lines: report.stats },
              ...(report.sections ?? []).map((x) => ({ title: x.title, lines: x.lines, own: true })),
            ].map((group, gi) =>
              group.lines.length ? (
                <React.Fragment key={gi}>
                  {group.title ? <div className={`mt-4 mb-2 text-xs font-semibold ${"own" in group ? "summary-section-title" : "text-fg-3"}`}>{group.title}</div> : null}
                  <div className="factory-total-grid">
                    {group.lines.map((line) => (
                      <div key={`${line.name}-${line.unit}`} className="min-w-0" title={line.name}>
                        <span className="flex min-w-0 items-center gap-1.5">
                          {line.icon ? <ItemIcon sources={[line.icon]} size={28} label={line.name} /> : null}
                          <span className="line-clamp-2 text-xs leading-snug text-fg-3">{line.name}</span>
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
