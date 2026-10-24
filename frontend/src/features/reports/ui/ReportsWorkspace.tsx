"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { Scopes, type Can } from "@/entities/session";
import { ReportProgressPanel } from "@/features/reports/ui/ReportProgress";
import { orderKindOf, REPORT_STATUS_LABEL, REPORT_TRANSITIONS, orderDraft, reportApi, type Report, type ReportStatus } from "@/entities/report";
import {
  ApiError,
  DocReader,
  EmptyState,
  ExportBar,
  Loading,
  assetUrl,
  canvasToBlob,
  errorText,
  formatDateTime,
  renderPages,
  useConfirm,
  useDocExport,
  useI18n,
  useNotify,
  type ExportDoc,
  type MessageKey,
  type Translate,
  UiGlyph,
  PagedMore,
  usePaged,
} from "@/shared";

type Filter = "active" | "all" | "done" | "cancelled";

const FILTERS: { key: Filter; label: MessageKey; statuses?: ReportStatus[] }[] = [
  { key: "active", label: "reports.filter.active", statuses: ["open", "in_progress"] },
  { key: "done", label: "reports.filter.done", statuses: ["done"] },
  { key: "cancelled", label: "reports.filter.cancelled", statuses: ["cancelled"] },
  { key: "all", label: "common.all" },
];

const STATUS_COLOR: Record<ReportStatus, string> = {
  open: "var(--accent)",
  in_progress: "#60a5fa",
  done: "#4ade80",
  cancelled: "var(--danger)",
};

const ACTION_LABEL: Record<ReportStatus, MessageKey> = {
  open: "reports.action.open",
  in_progress: "reports.action.in_progress",
  done: "reports.action.done",
  cancelled: "reports.action.cancelled",
};

interface ReportsWorkspaceProps {
  can: Can;
  /** Текущий пользователь: свои записи журнала выполнения он может удалить. */
  userId: string;
  /** Строки рапорта загружены в черновик — открыть вкладку «Заказы». */
  onOpenConstructor: () => void;
}

function toDoc(report: Report, t: Translate): ExportDoc {
  const kind = orderKindOf(report.meta.type);
  const meta = [
    kind && `${t("orderSend.kind")}: ${t(kind.label)}`,
    report.meta.region && `${t("doc.hex")}: ${report.meta.region}`,
    report.meta.stockpile && `${t("doc.stockpile")}: ${report.meta.stockpile}`,
  ].filter(Boolean) as string[];
  return {
    title: `SINDARIS • ${report.title}`,
    header: [...meta, `${t("doc.author")}: ${report.created_by_name ?? report.created_by} • ${formatDateTime(report.created_at)}`, `${t("doc.status")}: ${t(REPORT_STATUS_LABEL[report.status])}`],
    sections: [{ rows: report.lines.map((l) => ({ name: l.name, quantity: l.quantity, unit: unitLabel(l.unit, t), icon: assetUrl(l.icon_url) })) }],
    fileBase: `SINDARIS_report_${report.title}`.slice(0, 60),
    sheetName: t("reports.report"),
  };
}

const unitLabel = (unit: string, t: Translate) => t(unit === "crate" ? "unit.crate" : "unit.unit");

/** «Текущие заказы клана» — рапорты снабжения штаба: статусы, экспорт, отправка в Discord. */
export const ReportsWorkspace: React.FC<ReportsWorkspaceProps> = ({ can, userId, onOpenConstructor }) => {
  const notify = useNotify();
  const { t } = useI18n();
  const { media } = useContent();
  const texture = media("bg_report_texture");
  const { run: exportDoc, previewModal } = useDocExport(texture);
  const [filter, setFilter] = React.useState<Filter>("active");
  const [query, setQuery] = React.useState("");
  const [reports, setReports] = React.useState<Report[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [armed, confirm] = useConfirm();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setReports(await reportApi.list(FILTERS.find((f) => f.key === filter)?.statuses));
    } catch (err) {
      notify({ title: t("reports.reports"), message: errorText(err, t("reports.loadFailed")), tone: "danger" });
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [filter, notify, t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((r) => r.title.toLowerCase().includes(q) || r.lines.some((l) => l.name.toLowerCase().includes(q)));
  }, [reports, query]);
  const page = usePaged(visible, 20, query);

  const replace = (report: Report) => setReports((prev) => prev.map((r) => (r.id === report.id ? report : r)));

  const act = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = (report: Report, status: ReportStatus) =>
    act(report.id, async () => {
      try {
        const r = await reportApi.setStatus(report.id, status);
        notify({ title: t("reports.report"), message: r.message, tone: "success" });
        const keep = FILTERS.find((f) => f.key === filter)?.statuses;
        if (keep && !keep.includes(status)) setReports((prev) => prev.filter((x) => x.id !== report.id));
        else replace(r.report);
      } catch (err) {
        notify({ title: t("reports.report"), message: errorText(err, t("reports.statusFailed")), tone: "danger" });
      }
    });

  const sendToDiscord = (report: Report) =>
    act(report.id, async () => {
      try {
        const [first] = await renderPages(toDoc(report, t), texture);
        const image = first ? await canvasToBlob(first) : null;
        const r = await reportApi.sendToDiscord(report.id, image);
        replace(r.report);
        notify({ title: "DISCORD", message: r.message, tone: "success" });
      } catch (err) {
        const notConfigured = err instanceof ApiError && err.code === "discord_not_configured";
        notify({ title: "DISCORD", message: errorText(err, t("reports.discordFailed")), tone: notConfigured ? "warning" : "danger", ttl: 8000 });
      }
    });

  const remove = (report: Report) =>
    act(report.id, async () => {
      try {
        await reportApi.delete(report.id);
        setReports((prev) => prev.filter((r) => r.id !== report.id));
        notify({ title: t("reports.archive"), message: t("reports.deleted", { title: report.title }), tone: "warning" });
      } catch (err) {
        notify({ title: t("reports.archive"), message: errorText(err, t("reports.deleteFailed")), tone: "danger" });
      }
    });

  const totals = React.useMemo(
    () => ({ lines: reports.reduce((n, r) => n + r.lines_count, 0), units: reports.reduce((n, r) => n + r.total_quantity, 0) }),
    [reports],
  );

  return (
    <div className="tab-fade flex flex-col gap-3">
      <section className="panel panel-corners rounded-md p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <UiGlyph icon="reports" size={40} />
            <div>
              <div className="hud-label text-muted">{t("reports.kicker")}</div>
              <h1 className="panel-title mt-1 text-[1rem] md:text-[1.2rem]">📋 {t("reports.title")}</h1>
              <p className="mt-1 text-[0.8rem] text-white/70">{t("reports.subtitle")}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="badge-count min-w-0 px-2">{t("reports.count", { n: reports.length })}</span>
            <span className="badge-count min-w-0 px-2">{t("common.pos", { n: totals.lines })}</span>
            <span className="badge-count min-w-0 px-2">Σ {totals.units}</span>
          </div>
        </div>
        <div className="stencil-line mt-3" />
        <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
          <div data-guide="reports-filters" className="flex gap-1.5 overflow-x-auto">
            {FILTERS.map((f) => (
              <button key={f.key} className={`chip h-9 shrink-0 px-4 ${filter === f.key ? "is-active" : ""}`} onClick={() => setFilter(f.key)}>
                {t(f.label)}
              </button>
            ))}
          </div>
          <input className="field field-mono lg:ml-auto lg:w-72" data-guide="reports-search" placeholder={t("reports.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn" onClick={() => void load()}>⟳ {t("common.sync")}</button>
        </div>
      </section>

      {loading ? (
        <div className="panel rounded-md"><Loading label={t("reports.loading")} /></div>
      ) : visible.length === 0 ? (
        <div className="panel panel-corners rounded-md">
          <EmptyState icon="orders" title={reports.length ? t("common.nothingFound") : t("reports.empty")} />
        </div>
      ) : (
        <ul className="grid gap-3">
          {page.items.map((report) => {
            const open = expanded === report.id;
            const busy = busyId === report.id;
            return (
              <li data-guide="report-card" key={report.id} className="panel panel-corners report-card rounded-md p-3">
                {/* слева — страница заказа целиком (как PNG-экспорт), справа — данные и действия */}
                <div className="report-card-page">
                  <DocReader doc={toDoc(report, t)} textureUrl={texture} expanded={open} onExpand={() => setExpanded(report.id)} />
                </div>
                <div className="report-card-body">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => setExpanded(open ? null : report.id)}>
                    <span className="mt-0.5 shrink-0 text-white/50">{open ? "▾" : "▸"}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[0.95rem] font-bold text-white">{report.title}</span>
                      <span className="hud-label mt-0.5 block text-muted">
                        {formatDateTime(report.created_at)} • {report.created_by_name ?? report.created_by}
                        {report.meta.stockpile ? ` • ${report.meta.region ?? ""} ▶ ${report.meta.stockpile}` : ""}
                      </span>
                    </span>
                  </button>
                  <span data-guide="report-status" className="hud-label shrink-0 rounded border px-1.5 py-0.5" style={{ color: STATUS_COLOR[report.status], borderColor: STATUS_COLOR[report.status] }}>
                    {t(REPORT_STATUS_LABEL[report.status])}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
                  <span className="badge-count">{t("common.pos", { n: report.lines_count })}</span>
                  <span className="badge-count">Σ {report.total_quantity}</span>
                  {orderKindOf(report.meta.type) ? (
                    <span className="order-kind-badge">{orderKindOf(report.meta.type)!.icon} {t(orderKindOf(report.meta.type)!.label)}</span>
                  ) : null}
                  {report.discord_sent_at && <span className="hud-label text-accent" title={formatDateTime(report.discord_sent_at)}>✓ DISCORD</span>}
                </div>

                {report.note && (
                  <div className="order-note"><span className="order-note-label">📝 {t("reports.noteLabel")}</span><p>{report.note}</p></div>
                )}

                <div data-guide="report-actions" className="mt-3 flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
                  {can(Scopes.REPORTS_STATUS) &&
                    REPORT_TRANSITIONS[report.status].map((next) => (
                      <button key={next} className={`btn px-2 py-1 text-[0.65rem] ${next === "cancelled" ? "btn-danger" : next === "done" ? "btn-primary" : ""}`} disabled={busy} onClick={() => void setStatus(report, next)}>
                        {t(ACTION_LABEL[next])}
                      </button>
                    ))}
                  <button className="btn px-2 py-1 text-[0.65rem]" disabled={busy} data-guide="report-builder" title={t("reports.toBuilderHint")} onClick={() => {
                    orderDraft.write(orderDraft.fromReport(report));
                    notify({ title: t("builder.short"), message: t("reports.loadedToBuilder", { title: report.title }), tone: "info" });
                    onOpenConstructor();
                  }}>
                    ⤴ {t("reports.toBuilder")}
                  </button>
                  {can(Scopes.REPORTS_DISCORD) && (
                    <button className="btn px-2 py-1 text-[0.65rem]" data-guide="report-discord" style={{ borderColor: "#5865F2", color: "#c7d2fe" }} disabled={busy} onClick={() => void sendToDiscord(report)}>
                      {busy ? <span className="pulse">{t("common.sending")}</span> : `📨 ${t("reports.toDiscord")}`}
                    </button>
                  )}
                  {can(Scopes.REPORTS_DELETE) && (
                    <button className={`btn btn-danger ml-auto px-2 py-1 text-[0.65rem] ${armed === report.id ? "btn-active" : ""}`} disabled={busy} onClick={() => confirm(report.id, () => void remove(report))}>
                      {armed === report.id ? t("common.confirmQ") : "🗑"}
                    </button>
                  )}
                </div>
                <ExportBar title={t("reports.exportTitle")} onAction={(fmt) => void exportDoc(toDoc(report, t), fmt)} busy={busy} />
                <ReportProgressPanel report={report} can={can} userId={userId} onStatusMaybeChanged={() => void load()} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {visible.length > 0 && <PagedMore page={page} />}
      {previewModal}
    </div>
  );
};
