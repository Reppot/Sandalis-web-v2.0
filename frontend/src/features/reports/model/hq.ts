import type { Priority, Report, ReportStatus } from "@/entities/report";
import { parseDate, today, type Operation } from "@/features/operations/model/operations";

/* «Штаб» заказов: представления, совмещаемые фильтры, сводка и готовность операций. */

export const VIEWS = ["active", "mine", "overdue", "unassigned", "operations", "done", "cancelled", "all"] as const;
export type View = (typeof VIEWS)[number];

export interface Facets {
  assignee: string;   // "" — любой, "none" — без исполнителя, иначе user_id
  priority: "" | Priority;
  region: string;
  operation: string;  // "" — любая, "none" — без операции, иначе id
  tag: string;
}
export const NO_FACETS: Facets = { assignee: "", priority: "", region: "", operation: "", tag: "" };

const ACTIVE: ReportStatus[] = ["open", "in_progress"];
export const isActive = (r: Report) => ACTIVE.includes(r.status);
export const isOverdue = (r: Report, now = today()) => isActive(r) && Boolean(r.due_date) && r.due_date! < now;

/** Операции заказа: привязка из карточки + метки «Заказ» на снимках карты. */
export function operationsOf(r: Report, ops: Operation[]): Operation[] {
  return ops.filter((o) => o.id === r.operation_id || o.report_ids.includes(r.id));
}

export const progressOf = (r: Report) => (r.total_quantity ? Math.min(1, r.delivered_total / r.total_quantity) : 0);

const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

/** Активные — по срочности: просроченные, приоритет, ближайший срок; остальные — новые первыми. */
export function sortTasks(list: Report[]): Report[] {
  const now = today();
  return [...list].sort((a, b) => {
    const act = Number(isActive(b)) - Number(isActive(a));
    if (act) return act;
    if (!isActive(a)) return b.updated_at.localeCompare(a.updated_at);
    const late = Number(isOverdue(b, now)) - Number(isOverdue(a, now));
    if (late) return late;
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr) return pr;
    const due = (a.due_date ?? "9999") .localeCompare(b.due_date ?? "9999");
    return due || b.created_at.localeCompare(a.created_at);
  });
}

export function applyView(list: Report[], view: View, userId: string, ops: Operation[]): Report[] {
  const now = today();
  switch (view) {
    case "active": return list.filter(isActive);
    case "mine": return list.filter((r) => isActive(r) && (r.assignees.some((a) => a.user_id === userId) || r.created_by === userId || r.contributor_ids.includes(userId)));
    case "overdue": return list.filter((r) => isOverdue(r, now));
    case "unassigned": return list.filter((r) => isActive(r) && r.assignees.length === 0);
    case "operations": return list.filter((r) => operationsOf(r, ops).some((o) => o.date >= now));
    case "done": return list.filter((r) => r.status === "done");
    case "cancelled": return list.filter((r) => r.status === "cancelled");
    default: return list;
  }
}

export function applyFacets(list: Report[], f: Facets, ops: Operation[]): Report[] {
  return list.filter((r) => {
    if (f.assignee === "none" && r.assignees.length) return false;
    if (f.assignee && f.assignee !== "none" && !r.assignees.some((a) => a.user_id === f.assignee)) return false;
    if (f.priority && r.priority !== f.priority) return false;
    if (f.region && (r.meta.region ?? "") !== f.region) return false;
    if (f.tag && !r.tags.includes(f.tag)) return false;
    if (f.operation) {
      const mine = operationsOf(r, ops);
      if (f.operation === "none" ? mine.length > 0 : !mine.some((o) => o.id === f.operation)) return false;
    }
    return true;
  });
}

export interface Summary {
  open: number;
  inProgress: number;
  overdue: number;
  unassigned: number;
  doneWeek: number;
}

export function summarize(list: Report[]): Summary {
  const now = today();
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  return {
    open: list.filter((r) => r.status === "open").length,
    inProgress: list.filter((r) => r.status === "in_progress").length,
    overdue: list.filter((r) => isOverdue(r, now)).length,
    unassigned: list.filter((r) => isActive(r) && r.assignees.length === 0).length,
    doneWeek: list.filter((r) => r.status === "done" && r.updated_at >= week).length,
  };
}

/** Готовность предстоящей операции по заказам: доставлено / заказано (ящики и штуки вместе). */
export function readiness(op: Operation, list: Report[]) {
  const mine = list.filter((r) => r.operation_id === op.id || op.report_ids.includes(r.id));
  const ordered = mine.reduce((n, r) => n + r.total_quantity, 0);
  const delivered = mine.reduce((n, r) => n + r.delivered_total, 0);
  return { reports: mine.length, ordered, delivered, ratio: ordered ? delivered / ordered : 0 };
}

/** Срок относительно сегодня: -2 — просрочен на 2 дня, 0 — сегодня, 1 — завтра. */
export function daysLeft(due: string): number {
  return Math.round((parseDate(due).getTime() - parseDate(today()).getTime()) / 86_400_000);
}
