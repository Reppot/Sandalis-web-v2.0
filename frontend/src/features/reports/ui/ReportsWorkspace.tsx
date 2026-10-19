"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { UNIT_LABEL } from "@/entities/item";
import { REPORT_STATUS_LABEL, REPORT_TRANSITIONS, orderDraft, reportApi, type Report, type ReportStatus } from "@/entities/report";
import {
  ApiError,
  EmptyState,
  ExportBar,
  ItemIcon,
  Loading,
  assetUrl,
  canvasToBlob,
  errorText,
  formatDateTime,
  renderPages,
  uiIcon,
  useConfirm,
  useDocExport,
  useNotify,
  type ExportDoc,
} from "@/shared";

type Filter = "active" | "all" | "done" | "cancelled";

const FILTERS: { key: Filter; label: string; statuses?: ReportStatus[] }[] = [
  { key: "active", label: "Текущие", statuses: ["open", "in_progress"] },
  { key: "done", label: "Выполненные", statuses: ["done"] },
  { key: "cancelled", label: "Отменённые", statuses: ["cancelled"] },
  { key: "all", label: "Все" },
];

const STATUS_COLOR: Record<ReportStatus, string> = {
  open: "var(--accent)",
  in_progress: "#60a5fa",
  done: "#4ade80",
  cancelled: "var(--danger)",
};

const ACTION_LABEL: Record<ReportStatus, string> = {
  open: "↺ Вернуть в очередь",
  in_progress: "▶ Взять в работу",
  done: "✔ Выполнен",
  cancelled: "✕ Отменить",
};

interface ReportsWorkspaceProps {
  canWrite: boolean;
  canDelete: boolean;
  /** Строки рапорта загружены в черновик — открыть вкладку «Заказы». */
  onOpenConstructor: () => void;
}

function toDoc(report: Report): ExportDoc {
  const meta = [report.meta.region && `Гекс: ${report.meta.region}`, report.meta.stockpile && `Склад: ${report.meta.stockpile}`].filter(Boolean) as string[];
  return {
    title: `SINDARIS • ${report.title}`,
    header: [...meta, `Автор: ${report.created_by_name ?? report.created_by} • ${formatDateTime(report.created_at)}`, `Статус: ${REPORT_STATUS_LABEL[report.status]}`],
    sections: [{ rows: report.lines.map((l) => ({ name: l.name, quantity: l.quantity, unit: UNIT_LABEL[l.unit] })) }],
    fileBase: `SINDARIS_рапорт_${report.title}`.slice(0, 60),
    sheetName: "Рапорт",
  };
}

/** «Текущие заказы клана» — рапорты снабжения штаба: статусы, экспорт, отправка в Discord. */
export const ReportsWorkspace: React.FC<ReportsWorkspaceProps> = ({ canWrite, canDelete, onOpenConstructor }) => {
  const notify = useNotify();
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
      notify({ title: "РАПОРТЫ", message: errorText(err, "Архив рапортов недоступен"), tone: "danger" });
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [filter, notify]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((r) => r.title.toLowerCase().includes(q) || r.lines.some((l) => l.name.toLowerCase().includes(q)));
  }, [reports, query]);

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
        notify({ title: "РАПОРТ", message: r.message, tone: "success" });
        const keep = FILTERS.find((f) => f.key === filter)?.statuses;
        if (keep && !keep.includes(status)) setReports((prev) => prev.filter((x) => x.id !== report.id));
        else replace(r.report);
      } catch (err) {
        notify({ title: "РАПОРТ", message: errorText(err, "Статус не изменён"), tone: "danger" });
      }
    });

  const sendToDiscord = (report: Report) =>
    act(report.id, async () => {
      try {
        const [first] = await renderPages(toDoc(report), texture);
        const image = first ? await canvasToBlob(first) : null;
        const r = await reportApi.sendToDiscord(report.id, image);
        replace(r.report);
        notify({ title: "DISCORD", message: r.message, tone: "success" });
      } catch (err) {
        const notConfigured = err instanceof ApiError && err.code === "discord_not_configured";
        notify({ title: "DISCORD", message: errorText(err, "Discord не принял сообщение"), tone: notConfigured ? "warning" : "danger", ttl: 8000 });
      }
    });

  const remove = (report: Report) =>
    act(report.id, async () => {
      try {
        await reportApi.delete(report.id);
        setReports((prev) => prev.filter((r) => r.id !== report.id));
        notify({ title: "АРХИВ", message: `Рапорт «${report.title}» удалён.`, tone: "warning" });
      } catch (err) {
        notify({ title: "АРХИВ", message: errorText(err, "Рапорт не удалён"), tone: "danger" });
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={uiIcon("log-file")} alt="" width={40} height={40} className="ui-icon h-10 w-10 object-contain" />
            <div>
              <div className="hud-label text-muted">Архив рапортов штаба</div>
              <h1 className="panel-title mt-1 text-[1rem] md:text-[1.2rem]">📋 Текущие заказы клана</h1>
              <p className="mt-1 text-[0.8rem] text-white/70">Рапорты из конструктора заказа: статусы, выгрузка и отправка в канал Discord.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="badge-count min-w-0 px-2">{reports.length} РАПОРТ.</span>
            <span className="badge-count min-w-0 px-2">{totals.lines} ПОЗ.</span>
            <span className="badge-count min-w-0 px-2">Σ {totals.units}</span>
          </div>
        </div>
        <div className="stencil-line mt-3" />
        <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex gap-1.5 overflow-x-auto">
            {FILTERS.map((f) => (
              <button key={f.key} className={`chip h-9 shrink-0 px-4 ${filter === f.key ? "is-active" : ""}`} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          <input className="field field-mono lg:ml-auto lg:w-72" placeholder="🔍 Поиск по рапорту или предмету..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn" onClick={() => void load()}>⟳ Синхр.</button>
        </div>
      </section>

      {loading ? (
        <div className="panel rounded-md"><Loading label="📡 ЗАГРУЗКА АРХИВА РАПОРТОВ..." /></div>
      ) : visible.length === 0 ? (
        <div className="panel panel-corners rounded-md">
          <EmptyState icon={uiIcon("parchment")} title={reports.length ? "Ничего не найдено по запросу" : "Рапортов нет — соберите заказ в конструкторе и отправьте его в штаб"} />
        </div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {visible.map((report) => {
            const open = expanded === report.id;
            const busy = busyId === report.id;
            return (
              <li key={report.id} className="panel panel-corners flex flex-col rounded-md p-3">
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
                  <span className="hud-label shrink-0 rounded border px-1.5 py-0.5" style={{ color: STATUS_COLOR[report.status], borderColor: STATUS_COLOR[report.status] }}>
                    {REPORT_STATUS_LABEL[report.status]}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
                  <span className="badge-count">{report.lines_count} поз.</span>
                  <span className="badge-count">Σ {report.total_quantity}</span>
                  {report.discord_sent_at && <span className="hud-label text-accent" title={formatDateTime(report.discord_sent_at)}>✓ DISCORD</span>}
                </div>

                {open ? (
                  <ul className="mt-2 grid gap-1 border-t border-white/10 pt-2 pl-5 sm:grid-cols-2">
                    {report.lines.map((line) => (
                      <li key={line.id} className="flex items-center gap-2 text-[0.78rem] text-white/85">
                        <ItemIcon sources={[assetUrl(line.icon_url)]} size={28} label={line.name} />
                        <span className="min-w-0 truncate">{line.name}</span>
                        <span className="badge-count ml-auto min-w-0 shrink-0 px-2">{line.quantity} {UNIT_LABEL[line.unit]}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 truncate pl-5 text-[0.75rem] text-white/60">{report.lines.slice(0, 4).map((l) => `${l.name} ×${l.quantity}`).join(" • ")}{report.lines.length > 4 ? " …" : ""}</p>
                )}
                {report.note && <p className="mt-2 pl-5 text-[0.75rem] text-white/70">📝 {report.note}</p>}

                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
                  {canWrite &&
                    REPORT_TRANSITIONS[report.status].map((next) => (
                      <button key={next} className={`btn px-2 py-1 text-[0.65rem] ${next === "cancelled" ? "btn-danger" : next === "done" ? "btn-primary" : ""}`} disabled={busy} onClick={() => void setStatus(report, next)}>
                        {ACTION_LABEL[next]}
                      </button>
                    ))}
                  <button className="btn px-2 py-1 text-[0.65rem]" disabled={busy} title="Загрузить строки в конструктор заказа" onClick={() => {
                    orderDraft.write(orderDraft.fromReport(report));
                    notify({ title: "КОНСТРУКТОР", message: `Рапорт «${report.title}» загружен в конструктор.`, tone: "info" });
                    onOpenConstructor();
                  }}>
                    ⤴ В конструктор
                  </button>
                  {canWrite && (
                    <button className="btn px-2 py-1 text-[0.65rem]" style={{ borderColor: "#5865F2", color: "#c7d2fe" }} disabled={busy} onClick={() => void sendToDiscord(report)}>
                      {busy ? <span className="pulse">ПЕРЕДАЧА...</span> : "📨 В Discord"}
                    </button>
                  )}
                  {canDelete && (
                    <button className={`btn btn-danger ml-auto px-2 py-1 text-[0.65rem] ${armed === report.id ? "btn-active" : ""}`} disabled={busy} onClick={() => confirm(report.id, () => void remove(report))}>
                      {armed === report.id ? "Подтвердить?" : "🗑"}
                    </button>
                  )}
                </div>
                <ExportBar title="ВЫГРУЗКА РАПОРТА" onAction={(fmt) => void exportDoc(toDoc(report), fmt)} busy={busy} />
              </li>
            );
          })}
        </ul>
      )}
      {previewModal}
    </div>
  );
};
