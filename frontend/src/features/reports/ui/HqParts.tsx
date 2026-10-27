"use client";

import * as React from "react";
import { REPORT_STATUS_LABEL, type Priority, type Report, type ReportStatus } from "@/entities/report";
import { daysLeft, isOverdue, operationsOf, progressOf, readiness, type Summary, type View } from "@/features/reports/model/hq";
import { parseDate, type Operation } from "@/features/operations/model/operations";
import { Icon, cn, useI18n, type IconName, type MessageKey } from "@/shared";

export const PRIORITY_ICON: Record<Priority, IconName> = { high: "chevronDown", normal: "minus", low: "chevronDown" };
export const STATUS_BADGE: Record<ReportStatus, string> = { open: "badge-accent", in_progress: "badge-info", done: "badge-accent", cancelled: "badge-danger" };

/** Сводка штаба: плитки — быстрые представления. */
export const HqSummary: React.FC<{ summary: Summary; onView: (v: View) => void; view: View }> = ({ summary, onView, view }) => {
  const { t } = useI18n();
  const tiles: { key: View; label: MessageKey; value: number; tone?: string }[] = [
    { key: "active", label: "hq.open", value: summary.open },
    { key: "active", label: "hq.inProgress", value: summary.inProgress },
    { key: "overdue", label: "hq.overdue", value: summary.overdue, tone: summary.overdue ? "is-danger" : undefined },
    { key: "unassigned", label: "hq.unassigned", value: summary.unassigned, tone: summary.unassigned ? "is-warn" : undefined },
    { key: "done", label: "hq.doneWeek", value: summary.doneWeek },
  ];
  return (
    <div className="hq-tiles">
      {tiles.map((tile) => (
        <button key={tile.label} type="button" className={cn("hq-tile", tile.tone, view === tile.key && tile.key !== "active" && "is-active")} onClick={() => onView(tile.key)}>
          <span className="hq-tile-label">{t(tile.label)}</span>
          <span className="hq-tile-value tabular">{tile.value}</span>
        </button>
      ))}
    </div>
  );
};

/** Полоса ближайших операций: готовность по заказам; клик — фильтр по операции. */
export const OperationsStrip: React.FC<{ ops: Operation[]; reports: Report[]; active: string; onPick: (id: string) => void; onOpenOperations: () => void }> = ({ ops, reports, active, onPick, onOpenOperations }) => {
  const { t, locale } = useI18n();
  return (
    <div className="hq-ops">
      <div className="hq-ops-head">
        <span className="field-label">{t("hq.upcomingOps")}</span>
        <button type="button" className="text-xs text-fg-3 hover:text-fg" onClick={onOpenOperations}>{t("hq.allOps")} →</button>
      </div>
      {ops.length ? (
        <div className="hq-ops-list">
          {ops.map((op) => {
            const r = readiness(op, reports);
            const days = daysLeft(op.date);
            return (
              <button key={op.id} type="button" className={cn("hq-op", active === op.id && "is-active")} onClick={() => onPick(active === op.id ? "" : op.id)}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold text-fg">{op.title}</span>
                  <span className="shrink-0 text-xs text-fg-3">{new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(parseDate(op.date))}</span>
                </span>
                <span className="hq-bar"><i style={{ width: `${Math.round(r.ratio * 100)}%` }} /></span>
                <span className="text-xs text-fg-3">
                  {r.reports ? t("hq.opReady", { n: r.reports, done: r.delivered, total: r.ordered }) : t("hq.opNoOrders")}
                  {" · "}{days <= 0 ? t("hq.today") : t("hq.inDays", { n: days })}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-fg-3">{t("hq.noOps")}</p>
      )}
    </div>
  );
};

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

export const Avatars: React.FC<{ people: { user_id: string; name: string }[]; max?: number }> = ({ people, max = 3 }) => (
  <span className="hq-avatars" title={people.map((p) => p.name).join(", ")}>
    {people.slice(0, max).map((p) => <span key={p.user_id} className="hq-avatar">{initials(p.name)}</span>)}
    {people.length > max ? <span className="hq-avatar is-more">+{people.length - max}</span> : null}
  </span>
);

/** Срок: «сегодня», «завтра», «через 3 дн.», «просрочен на 2 дн.». */
export const DueLabel: React.FC<{ report: Report }> = ({ report }) => {
  const { t, locale } = useI18n();
  if (!report.due_date) return <span className="text-fg-3">—</span>;
  const d = daysLeft(report.due_date);
  const late = isOverdue(report);
  const text = late ? t("hq.lateBy", { n: -d }) : d === 0 ? t("hq.today") : d === 1 ? t("hq.tomorrow") : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(parseDate(report.due_date));
  return <span className={cn(late ? "text-danger font-semibold" : d <= 1 ? "text-warn" : "text-fg-2")}>{text}</span>;
};

/** Строка задачи в списке штаба. */
export const TaskRow: React.FC<{ report: Report; ops: Operation[]; selected: boolean; onOpen: () => void }> = ({ report, ops, selected, onOpen }) => {
  const { t, locale } = useI18n();
  const pct = Math.round(progressOf(report) * 100);
  const mine = operationsOf(report, ops);
  return (
    <li>
      <button type="button" className={cn("hq-row", selected && "is-selected", `prio-${report.priority}`)} onClick={onOpen}>
        <span className={cn("hq-prio", `is-${report.priority}`)} title={t(`hq.priority.${report.priority}` as MessageKey)}>
          <Icon name={PRIORITY_ICON[report.priority]} size={14} className={report.priority === "high" ? "rotate-180" : undefined} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-fg">{report.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-3">
            {report.meta.region ? <span>{report.meta.region}{report.meta.stockpile ? ` · ${report.meta.stockpile}` : ""}</span> : null}
            {report.tags.map((tag) => <span key={tag} className="hq-tag">#{tag}</span>)}
            {mine.map((o) => (
              <span key={o.id} className="report-op-chip"><Icon name="flag" size={11} />{o.title} · {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(parseDate(o.date))}</span>
            ))}
          </span>
        </span>
        <span className="hq-cell">{report.assignees.length ? <Avatars people={report.assignees} /> : <span className="text-xs text-warn">{t("hq.noAssignee")}</span>}</span>
        <span className="hq-cell text-sm"><DueLabel report={report} /></span>
        <span className="hq-cell hq-progress">
          <span className="text-xs tabular text-fg-2">{pct}%</span>
          <span className="hq-bar"><i style={{ width: `${pct}%` }} /></span>
        </span>
        <span className="hq-cell"><span className={`badge ${STATUS_BADGE[report.status]}`}>{t(REPORT_STATUS_LABEL[report.status])}</span></span>
      </button>
    </li>
  );
};
