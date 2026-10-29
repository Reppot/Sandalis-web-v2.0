"use client";

import * as React from "react";
import { REPORT_STATUS_LABEL, REPORT_TRANSITIONS, type Report, type ReportStatus } from "@/entities/report";
import { isoDate, today, type Operation } from "@/features/operations/model/operations";
import { isOverdue, operationsOf, progressOf } from "@/features/reports/model/hq";
import { Avatars, DueLabel } from "@/features/reports/ui/HqParts";
import { Icon, cn, useI18n } from "@/shared";

const COLUMNS: ReportStatus[] = ["open", "in_progress", "done", "cancelled"];

/**
 * Доска: колонки по статусам, карточку перетаскивают в другую колонку — меняется статус
 * (только разрешённые переходы и при праве менять статус).
 */
export const BoardView: React.FC<{
  reports: Report[];
  ops: Operation[];
  canStatus: boolean;
  showClosed: boolean;
  onOpen: (r: Report) => void;
  onMove: (r: Report, s: ReportStatus) => void;
}> = ({ reports, ops, canStatus, showClosed, onOpen, onMove }) => {
  const { t } = useI18n();
  const [drag, setDrag] = React.useState<Report | null>(null);
  const [over, setOver] = React.useState<ReportStatus | null>(null);
  const columns = COLUMNS.filter((c) => showClosed || c === "open" || c === "in_progress" || c === "done");
  const allowed = (s: ReportStatus) => Boolean(drag) && canStatus && drag!.status !== s && REPORT_TRANSITIONS[drag!.status].includes(s);

  return (
    <div className="hq-board" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(15rem, 1fr))`, ["--cols" as string]: columns.length }}>
      {columns.map((col) => {
        const list = reports.filter((r) => r.status === col);
        return (
          <section
            key={col}
            className={cn("hq-col", over === col && allowed(col) && "is-over", drag && !allowed(col) && drag.status !== col && "is-blocked")}
            onDragOver={(e) => { if (allowed(col)) { e.preventDefault(); setOver(col); } }}
            onDragLeave={() => setOver((o) => (o === col ? null : o))}
            onDrop={(e) => { e.preventDefault(); if (drag && allowed(col)) onMove(drag, col); setDrag(null); setOver(null); }}
          >
            <header className="hq-col-head">
              <span>{t(REPORT_STATUS_LABEL[col])}</span>
              <span className="count-pill">{list.length}</span>
            </header>
            <div className="hq-col-body">
              {list.map((r) => {
                const pct = Math.round(progressOf(r) * 100);
                return (
                  <article
                    key={r.id}
                    className={cn("hq-card", `prio-${r.priority}`, isOverdue(r) && "is-late")}
                    draggable={canStatus}
                    onDragStart={() => setDrag(r)}
                    onDragEnd={() => { setDrag(null); setOver(null); }}
                    onClick={() => onOpen(r)}
                  >
                    <div className="font-semibold text-fg">{r.title}</div>
                    {r.meta.region ? <div className="text-xs text-fg-3">{r.meta.region}</div> : null}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.tags.map((x) => <span key={x} className="hq-tag text-xs">#{x}</span>)}
                      {operationsOf(r, ops).map((o) => <span key={o.id} className="report-op-chip"><Icon name="flag" size={11} />{o.title}</span>)}
                    </div>
                    <span className="hq-bar mt-2"><i style={{ width: `${pct}%` }} /></span>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                      {r.assignees.length ? <Avatars people={r.assignees} /> : <span className="text-warn">{t("hq.noAssignee")}</span>}
                      <DueLabel report={r} />
                    </div>
                  </article>
                );
              })}
              {list.length === 0 ? <p className="hq-col-empty">{t("hq.board.empty")}</p> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
};

/** Календарь: сроки заказов и даты операций на одной сетке месяца. */
export const CalendarView: React.FC<{ reports: Report[]; ops: Operation[]; onOpen: (r: Report) => void }> = ({ reports, ops, onOpen }) => {
  const { t, locale } = useI18n();
  const [month, setMonth] = React.useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const first = new Date(month);
  first.setDate(1 - ((month.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    return d;
  });
  const byDue = new Map<string, Report[]>();
  for (const r of reports) if (r.due_date) byDue.set(r.due_date, [...(byDue.get(r.due_date) ?? []), r]);
  const opsBy = new Map<string, Operation[]>();
  for (const o of ops) opsBy.set(o.date, [...(opsBy.get(o.date) ?? []), o]);
  const now = today();
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 0, 1 + i)));
  const noDue = reports.filter((r) => !r.due_date && (r.status === "open" || r.status === "in_progress"));

  // телефон: вместо сетки месяца — список дней месяца, где есть сроки или операции
  const agenda = cells
    .filter((d) => d.getMonth() === month.getMonth())
    .map((d) => ({ d, key: isoDate(d) }))
    .filter(({ key }) => (byDue.get(key)?.length ?? 0) + (opsBy.get(key)?.length ?? 0) > 0);

  return (
    <section className="panel hq-cal p-4">
      <div className="ops-cal-head">
        <button type="button" className="icon-btn" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label={t("operations.prevMonth")}><Icon name="chevronLeft" size={16} /></button>
        <span className="ops-cal-title">{new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month)}</span>
        <button type="button" className="icon-btn" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label={t("operations.nextMonth")}><Icon name="chevronRight" size={16} /></button>
        <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-3">
          <span className="flex items-center gap-1"><i className="hq-legend is-op" />{t("hq.operation")}</span>
          <span className="flex items-center gap-1"><i className="hq-legend is-late" />{t("hq.overdue")}</span>
        </span>
      </div>
      <div className="ops-cal-grid">
        {weekdays.map((w) => <div key={w} className="ops-cal-wd">{w}</div>)}
        {cells.map((d) => {
          const key = isoDate(d);
          const tasks = byDue.get(key) ?? [];
          const dayOps = opsBy.get(key) ?? [];
          return (
            <div key={key} className={cn("ops-cal-day hq-cal-day", d.getMonth() !== month.getMonth() && "is-outside", key < now && "is-past", key === now && "is-today", (tasks.length || dayOps.length) > 0 && "is-busy")}>
              <span className="ops-cal-num">{d.getDate()}</span>
              <span className="ops-cal-list">
                {dayOps.map((o) => <span key={o.id} className="ops-cal-op" title={o.title}>⚑ {o.title}</span>)}
                {tasks.slice(0, 4).map((r) => (
                  <button key={r.id} type="button" className={cn("hq-cal-task", `prio-${r.priority}`, isOverdue(r) && "is-late", r.status === "done" && "is-done")} onClick={() => onOpen(r)} title={r.title}>{r.title}</button>
                ))}
                {tasks.length > 4 ? <span className="ops-cal-more">+{tasks.length - 4}</span> : null}
              </span>
            </div>
          );
        })}
      </div>
      <ol className="hq-agenda">
        {agenda.length === 0 ? <li className="text-sm text-fg-3">{t("hq.cal.emptyMonth")}</li> : agenda.map(({ d, key }) => (
          <li key={key} className={cn("hq-agenda-day", key === now && "is-today", key < now && "is-past")}>
            <span className="hq-agenda-date first-cap">{new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(d)}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              {(opsBy.get(key) ?? []).map((o) => <span key={o.id} className="ops-cal-op" title={o.title}>⚑ {o.title}</span>)}
              {(byDue.get(key) ?? []).map((r) => (
                <button key={r.id} type="button" className={cn("hq-cal-task", `prio-${r.priority}`, isOverdue(r) && "is-late", r.status === "done" && "is-done")} onClick={() => onOpen(r)}>{r.title}</button>
              ))}
            </span>
          </li>
        ))}
      </ol>
      {noDue.length ? (
        <p className="mt-3 text-xs text-fg-3">
          {t("hq.cal.noDue", { n: noDue.length })}{" "}
          {noDue.slice(0, 6).map((r) => <button key={r.id} type="button" className="hq-cal-task ml-1 inline-block" onClick={() => onOpen(r)}>{r.title}</button>)}
        </p>
      ) : null}
    </section>
  );
};
