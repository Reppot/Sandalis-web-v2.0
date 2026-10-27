"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { PRIORITIES, REPORT_STATUS_LABEL, REPORT_TRANSITIONS, orderKindOf, reportApi, type Assignee, type Report, type ReportStatus, type ReportTaskPatch } from "@/entities/report";
import { Scopes, type Can } from "@/entities/session";
import { parseDate, today, type Operation } from "@/features/operations/model/operations";
import { progressOf } from "@/features/reports/model/hq";
import { Avatars, DueLabel, STATUS_BADGE } from "@/features/reports/ui/HqParts";
import { ReportProgressPanel } from "@/features/reports/ui/ReportProgress";
import { OrderActivity } from "@/features/reports/ui/OrderActivity";
import { Icon, cn, errorText, formatDateTime, useI18n, useNotify, type MessageKey } from "@/shared";

const STEPS: ReportStatus[] = ["open", "in_progress", "done"];

/**
 * Карточка заказа — запись «штаба»: шаги статуса, исполнители (и «Беру»), приоритет, срок,
 * теги, привязка к операции, выполнение по строкам и прежние действия заказа.
 */
export const OrderCard: React.FC<{
  report: Report;
  ops: Operation[];
  members: Assignee[];
  can: Can;
  userId: string;
  busy: boolean;
  onClose: () => void;
  onChange: (r: Report) => void;
  onStatus: (r: Report, s: ReportStatus) => void;
  onReload: () => void;
  /** Страница заказа (как PNG), экспорт и действия — собирает список заказов. */
  document: React.ReactNode;
  actions: React.ReactNode;
}> = ({ report, ops, members, can, userId, busy, onClose, onChange, onStatus, onReload, document, actions }) => {
  const { t, locale } = useI18n();
  const notify = useNotify();
  const canEdit = can(Scopes.REPORTS_ASSIGN);
  const canStatus = can(Scopes.REPORTS_STATUS);
  const [tag, setTag] = React.useState("");
  const mine = report.assignees.some((a) => a.user_id === userId);
  const pct = Math.round(progressOf(report) * 100);

  // Esc — закрыть карточку
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = async (p: ReportTaskPatch) => {
    try {
      onChange(await reportApi.setTask(report.id, p));
    } catch (err) {
      notify({ title: t("hq.saveFailed"), message: errorText(err, t("hq.saveFailed")), tone: "danger" });
    }
  };
  const take = async () => {
    try {
      onChange(await reportApi.take(report.id, !mine));
    } catch (err) {
      notify({ title: t("hq.saveFailed"), message: errorText(err, t("hq.saveFailed")), tone: "danger" });
    }
  };
  const ids = report.assignees.map((a) => a.user_id);
  const addTag = () => {
    const v = tag.trim().replace(/^#/, "").toLowerCase();
    setTag("");
    if (v && !report.tags.includes(v)) void patch({ tags: [...report.tags, v] });
  };
  const upcoming = ops.filter((o) => o.date >= today() || o.id === report.operation_id);
  // операции, где заказ отмечен меткой на карте (без прямой привязки)
  const onMaps = ops.filter((o) => o.report_ids.includes(report.id) && o.id !== report.operation_id);
  const kind = orderKindOf(report.meta.type);

  // портал: у списка есть предок с transform (анимация вкладки), fixed внутри него не на весь экран
  return createPortal(
    <div className="hq-drawer-wrap" role="dialog" aria-modal="true" aria-label={report.title}>
      <button type="button" className="hq-drawer-backdrop" aria-label={t("common.close")} onClick={onClose} />
      <aside className="hq-drawer">
        <header className="hq-drawer-head">
          <div className="min-w-0">
            <div className="page-eyebrow">{kind ? t(kind.label) : t("reports.report")} · {formatDateTime(report.created_at)}</div>
            <h2 className="hq-drawer-title">{report.title}</h2>
            <div className="text-xs text-fg-3">{t("hq.by", { name: report.created_by_name ?? report.created_by })}</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t("common.close")}><Icon name="close" size={18} /></button>
        </header>

        {/* шаги статуса */}
        <div className="hq-steps">
          {STEPS.map((s) => {
            const allowed = canStatus && REPORT_TRANSITIONS[report.status].includes(s);
            return (
              <button key={s} type="button" disabled={!allowed || busy} className={cn("hq-step", report.status === s && "is-current", STEPS.indexOf(s) < STEPS.indexOf(report.status as ReportStatus) && "is-past")} onClick={() => onStatus(report, s)}>
                {t(REPORT_STATUS_LABEL[s])}
              </button>
            );
          })}
          {report.status === "cancelled" ? <span className={`badge ${STATUS_BADGE.cancelled}`}>{t(REPORT_STATUS_LABEL.cancelled)}</span> : null}
        </div>

        {/* поля задачи */}
        <div className="hq-fields">
          <div className="hq-field is-wide">
            <span className="field-label">{t("hq.assignees")}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {report.assignees.map((a) => (
                <span key={a.user_id} className="hq-person">
                  <Avatars people={[a]} max={1} />{a.name}
                  {canEdit ? <button type="button" className="hq-person-x" aria-label={t("common.delete")} onClick={() => void patch({ assignees: ids.filter((x) => x !== a.user_id) })}><Icon name="close" size={12} /></button> : null}
                </span>
              ))}
              {canEdit ? (
                <select className="field h-8 w-auto py-0 text-sm" value="" onChange={(e) => e.target.value && void patch({ assignees: [...ids, e.target.value] })} aria-label={t("hq.addAssignee")}>
                  <option value="">+ {t("hq.addAssignee")}</option>
                  {members.filter((m) => !ids.includes(m.user_id)).map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                </select>
              ) : null}
              {can(Scopes.REPORTS_TAKE) ? (
                <button type="button" className={cn("btn h-8 min-h-0 px-3 text-sm", !mine && "btn-primary")} onClick={() => void take()}>
                  <Icon name={mine ? "close" : "check"} size={14} />
                  {mine ? t("hq.drop") : t("hq.take")}
                </button>
              ) : null}
            </div>
          </div>

          <div className="hq-field">
            <span className="field-label">{t("hq.priorityLabel")}</span>
            {canEdit ? (
              <div className="segmented">
                {PRIORITIES.map((p) => (
                  <button key={p} type="button" className={cn("segmented-item", report.priority === p && "is-active")} onClick={() => void patch({ priority: p })}>{t(`hq.priority.${p}` as MessageKey)}</button>
                ))}
              </div>
            ) : <span className="text-sm">{t(`hq.priority.${report.priority}` as MessageKey)}</span>}
          </div>

          <div className="hq-field">
            <span className="field-label">{t("hq.due")}</span>
            {canEdit ? (
              <span className="flex items-center gap-1.5">
                <input type="date" className="field h-8 w-[10rem] px-2 py-0 text-sm" value={report.due_date ?? ""} onChange={(e) => void patch({ due_date: e.target.value || null })} />
                {report.due_date ? <span className="text-xs"><DueLabel report={report} /></span> : null}
              </span>
            ) : <DueLabel report={report} />}
          </div>

          <div className="hq-field">
            <span className="field-label">{t("hq.operation")}</span>
            {canEdit ? (
              <select className="field h-8 py-0 text-sm" value={report.operation_id ?? ""} onChange={(e) => void patch({ operation_id: e.target.value || null })}>
                <option value="">{t("hq.noOperation")}</option>
                {upcoming.map((o) => <option key={o.id} value={o.id}>{o.title} · {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(parseDate(o.date))}</option>)}
              </select>
            ) : <span className="text-sm">{ops.find((o) => o.id === report.operation_id)?.title ?? "—"}</span>}
            {onMaps.length ? <span className="text-xs text-fg-3">{t("hq.onMaps", { list: onMaps.map((o) => o.title).join(", ") })}</span> : null}
          </div>

          <div className="hq-field">
            <span className="field-label">{t("hq.where")}</span>
            <span className="text-sm text-fg">{[report.meta.region, report.meta.stockpile].filter(Boolean).join(" · ") || "—"}</span>
          </div>

          <div className="hq-field is-wide">
            <span className="field-label">{t("hq.tags")}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {report.tags.map((x) => (
                <span key={x} className="hq-tag is-big">#{x}{canEdit ? <button type="button" className="hq-person-x" aria-label={t("common.delete")} onClick={() => void patch({ tags: report.tags.filter((y) => y !== x) })}><Icon name="close" size={11} /></button> : null}</span>
              ))}
              {canEdit && report.tags.length < 8 ? (
                <input className="field h-8 w-36 px-2 py-0 text-sm" value={tag} maxLength={24} placeholder={t("hq.tagPlaceholder")} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }} onBlur={addTag} />
              ) : null}
            </div>
          </div>

          <div className="hq-field is-wide">
            <span className="field-label">{t("hq.progress")}</span>
            <span className="flex items-center gap-2">
              <span className="hq-bar flex-1"><i style={{ width: `${pct}%` }} /></span>
              <span className="text-sm tabular text-fg-2">{report.delivered_total} / {report.total_quantity} · {pct}%</span>
            </span>
          </div>
        </div>

        {report.note ? <div className="order-note"><span className="order-note-label">{t("reports.noteLabel")}</span><p>{report.note}</p></div> : null}

        {/* выполнение по строкам и журнал вкладов */}
        <ReportProgressPanel report={report} can={can} userId={userId} onStatusMaybeChanged={onReload} />

        {/* лента событий и обсуждение — обновляется после каждого изменения заказа */}
        <OrderActivity reportId={report.id} members={members} canComment={Boolean(userId) && can(Scopes.REPORTS_COMMENT)} refreshKey={`${report.updated_at}|${report.delivered_total}|${report.assignees.length}|${report.status}`} />

        <div className="hq-drawer-actions">{actions}</div>
        <details className="hq-doc">
          <summary>{t("hq.document")}</summary>
          {document}
        </details>
      </aside>
    </div>,
    window.document.body, // проп «document» перекрывает глобальный document
  );
};
