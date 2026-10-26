"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { codeSynonyms } from "@/entities/item";
import { Scopes, type Can } from "@/entities/session";
import { ReportProgressPanel } from "@/features/reports/ui/ReportProgress";
import { lineName, orderKindOf, REPORT_STATUS_LABEL, REPORT_TRANSITIONS, orderDraft, reportApi, type Report, type ReportStatus } from "@/entities/report";
import {
  ApiError,
  DocReader,
  EmptyState,
  matchesWords,
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
  PagedMore,
  usePaged,
  Icon,
  PageHeader,
  SearchField,
} from "@/shared";

type Filter = "active" | "all" | "done" | "cancelled";

const FILTERS: { key: Filter; label: MessageKey; statuses?: ReportStatus[] }[] = [
  { key: "active", label: "reports.filter.active", statuses: ["open", "in_progress"] },
  { key: "done", label: "reports.filter.done", statuses: ["done"] },
  { key: "cancelled", label: "reports.filter.cancelled", statuses: ["cancelled"] },
  { key: "all", label: "common.all" },
];

const STATUS_BADGE: Record<ReportStatus, string> = {
  open: "badge-accent",
  in_progress: "badge-info",
  done: "badge-accent",
  cancelled: "badge-danger",
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

function toDoc(report: Report, t: Translate, locale: string): ExportDoc {
  const kind = orderKindOf(report.meta.type);
  const meta = [
    kind && `${t("orderSend.kind")}: ${t(kind.label)}`,
    report.meta.region && `${t("doc.hex")}: ${report.meta.region}`,
    report.meta.stockpile && `${t("doc.stockpile")}: ${report.meta.stockpile}`,
  ].filter(Boolean) as string[];
  return {
    title: `SINDARIS • ${report.title}`,
    header: [...meta, `${t("doc.author")}: ${report.created_by_name ?? report.created_by} • ${formatDateTime(report.created_at)}`, `${t("doc.status")}: ${t(REPORT_STATUS_LABEL[report.status])}`],
    sections: [{ rows: report.lines.map((l) => ({ name: lineName(l, locale), quantity: l.quantity, unit: unitLabel(l.unit, t), icon: assetUrl(l.icon_url) })) }],
    fileBase: `SINDARIS_report_${report.title}`.slice(0, 60),
    sheetName: t("reports.report"),
  };
}

const unitLabel = (unit: string, t: Translate) => t(unit === "crate" ? "unit.crate" : "unit.unit");

/** «Текущие заказы клана» — рапорты снабжения штаба: статусы, экспорт, отправка в Discord. */
export const ReportsWorkspace: React.FC<ReportsWorkspaceProps> = ({ can, userId, onOpenConstructor }) => {
  const notify = useNotify();
  const { t, locale } = useI18n();
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
    return reports.filter((r) => matchesWords(`${r.title} ${r.lines.map((l) => `${l.name} ${l.name_ru ?? ""} ${l.name_en ?? ""} ${codeSynonyms(l.item_code).join(" ")}`).join(" ")}`, q));
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
        const [first] = await renderPages(toDoc(report, t, locale), texture);
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
    <div className="tab-fade flex flex-col gap-4">
      <PageHeader
        icon="reports"
        eyebrow={t("reports.kicker")}
        title={t("reports.title")}
        lead={t("reports.subtitle")}
        actions={
          <div className="stat-row">
            <div className="stat"><div className="stat-value">{reports.length}</div><div className="stat-label">{t("reports.reports")}</div></div>
            <div className="stat"><div className="stat-value">{totals.lines}</div><div className="stat-label">{t("doc.lines")}</div></div>
            <div className="stat"><div className="stat-value">{totals.units.toLocaleString()}</div><div className="stat-label">{t("common.total")}</div></div>
          </div>
        }
      >
        <div className="divider" />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div data-guide="reports-filters" className="flex gap-1.5 overflow-x-auto pb-0.5">
            {FILTERS.map((f) => (
              <button key={f.key} className={`chip shrink-0 ${filter === f.key ? "is-active" : ""}`} onClick={() => setFilter(f.key)}>
                {t(f.label)}
              </button>
            ))}
          </div>
          <SearchField className="lg:ml-auto lg:w-80" data-guide="reports-search" placeholder={t("reports.search")} value={query} onChange={setQuery} />
          <button className="btn h-10" onClick={() => void load()}>
            <Icon name="refresh" size={15} />
            {t("common.sync")}
          </button>
        </div>
      </PageHeader>

      {loading ? (
        <div className="panel"><Loading label={t("reports.loading")} /></div>
      ) : visible.length === 0 ? (
        <div className="panel">
          <EmptyState icon="orders" title={reports.length ? t("common.nothingFound") : t("reports.empty")} />
        </div>
      ) : (
        <ul className="grid gap-3">
          {page.items.map((report) => {
            const open = expanded === report.id;
            const busy = busyId === report.id;
            return (
              <li data-guide="report-card" key={report.id} className="panel report-card p-4 md:p-5">
                {/* слева — страница заказа целиком (как PNG-экспорт), справа — данные и действия */}
                <div className="report-card-page">
                  <DocReader doc={toDoc(report, t, locale)} textureUrl={texture} expanded={open} onExpand={() => setExpanded(report.id)} />
                </div>
                <div className="report-card-body">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => setExpanded(open ? null : report.id)}>
                    <Icon name="chevronRight" size={16} className={`mt-1 text-fg-3 transition-transform ${open ? "rotate-90" : ""}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-[1.05rem] font-semibold tracking-[-0.01em] text-fg">{report.title}</span>
                      <span className="mt-0.5 block text-xs text-fg-3">
                        {formatDateTime(report.created_at)} · {report.created_by_name ?? report.created_by}
                        {report.meta.stockpile ? ` · ${report.meta.region ?? ""} · ${report.meta.stockpile}` : ""}
                      </span>
                    </span>
                  </button>
                  <span data-guide="report-status" className={`badge shrink-0 ${STATUS_BADGE[report.status]}`}>
                    {t(REPORT_STATUS_LABEL[report.status])}
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-6">
                  <span className="count-pill">{t("common.pos", { n: report.lines_count })}</span>
                  <span className="count-pill">Σ {report.total_quantity}</span>
                  {orderKindOf(report.meta.type) ? (
                    <span className="order-kind-badge">{t(orderKindOf(report.meta.type)!.label)}</span>
                  ) : null}
                  {report.discord_sent_at && <span className="badge badge-info" title={formatDateTime(report.discord_sent_at)}><Icon name="check" size={11} strokeWidth={3} /> Discord</span>}
                </div>

                {report.note && (
                  <div className="order-note"><span className="order-note-label">{t("reports.noteLabel")}</span><p>{report.note}</p></div>
                )}

                <div data-guide="report-actions" className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                  {can(Scopes.REPORTS_STATUS) &&
                    REPORT_TRANSITIONS[report.status].map((next) => (
                      <button key={next} className={`btn ${next === "cancelled" ? "btn-danger" : next === "done" ? "btn-primary" : ""}`} disabled={busy} onClick={() => void setStatus(report, next)}>
                        {t(ACTION_LABEL[next])}
                      </button>
                    ))}
                  <button className="btn" disabled={busy} data-guide="report-builder" title={t("reports.toBuilderHint")} onClick={() => {
                    orderDraft.write(orderDraft.fromReport(report));
                    notify({ title: t("builder.short"), message: t("reports.loadedToBuilder", { title: report.title }), tone: "info" });
                    onOpenConstructor();
                  }}>
                    {t("reports.toBuilder")}
                  </button>
                  {can(Scopes.REPORTS_DISCORD) && (
                    <button className="btn btn-discord" data-guide="report-discord" disabled={busy} onClick={() => void sendToDiscord(report)}>
                      {busy ? <span className="pulse">{t("common.sending")}</span> : <><Icon name="send" size={15} />{t("reports.toDiscord")}</>}
                    </button>
                  )}
                  {can(Scopes.REPORTS_DELETE) && (
                    <button className={`btn ml-auto ${armed === report.id ? "btn-danger" : "btn-ghost btn-icon text-fg-3"}`} disabled={busy} title={t("common.delete")} aria-label={t("common.delete")} onClick={() => confirm(report.id, () => void remove(report))}>
                      {armed === report.id ? t("common.confirmQ") : <Icon name="trash" size={16} />}
                    </button>
                  )}
                </div>
                <ExportBar title={t("reports.exportTitle")} onAction={(fmt) => void exportDoc(toDoc(report, t, locale), fmt)} busy={busy} />
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
