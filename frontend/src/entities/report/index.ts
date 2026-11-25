import { STORAGE_KEYS, apiClient, readStorage, writeStorage, type IconName } from "@/shared";
import type { MessageKey, Page } from "@/shared";
import type { ItemUnit } from "@/entities/item";

export type ReportStatus = "open" | "in_progress" | "done" | "cancelled";

export interface ReportMeta {
  region?: string | null;
  type?: string | null;
  stockpile?: string | null;
}

/** Вид заказа (meta.type): на склад, на бункерную базу или на завод. */
export type OrderKind = "stockpile" | "bunker" | "factory";
export const ORDER_KINDS: { key: OrderKind; icon: IconName; label: MessageKey; hint: MessageKey }[] = [
  { key: "stockpile", icon: "warehouse", label: "orderKind.stockpile", hint: "orderKind.stockpileHint" },
  { key: "bunker", icon: "shield", label: "orderKind.bunker", hint: "orderKind.bunkerHint" },
  { key: "factory", icon: "box", label: "orderKind.factory", hint: "orderKind.factoryHint" },
];
export const orderKindOf = (type: string | null | undefined) => ORDER_KINDS.find((k) => k.key === type);

export interface ReportLine {
  id: string;
  position: number;
  name: string;
  item_code: string | null;
  quantity: number;
  unit: ItemUnit;
  icon_url: string | null;
  /** Названия из каталога по коду: русское (как в русском клиенте игры) и английское. */
  name_ru?: string | null;
  name_en?: string | null;
}

/** Название строки заказа на языке интерфейса: из каталога, иначе — как ввели. */
export function lineName(line: { name: string; name_ru?: string | null; name_en?: string | null }, locale: string): string {
  return (locale === "ru" ? line.name_ru : line.name_en) || line.name;
}

/** Рапорт снабжения (GET /api/v1/reports) — DTO сервера используется как есть. */
export type Priority = "high" | "normal" | "low";
export const PRIORITIES: Priority[] = ["high", "normal", "low"];

export interface Assignee {
  user_id: string;
  name: string;
}

/** Запись ленты заказа: события и комментарии. */
export interface ReportEvent {
  id: string;
  kind: "created" | "status" | "assigned" | "unassigned" | "take" | "drop" | "priority" | "due" | "tags" | "operation" | "contribution" | "delivered" | "comment" | string;
  actor_id: string;
  actor_name: string;
  payload: { value?: string | string[] | null; was?: string; name?: string; qty?: number; place?: string; note?: string; text?: string; mentions?: string[]; operation?: string };
  created_at: string;
}

/** Поля задачи: передаются только меняемые; null — очистить срок или операцию. */
export interface ReportTaskPatch {
  priority?: Priority;
  due_date?: string | null;
  tags?: string[];
  operation_id?: string | null;
  assignees?: string[];
}

export interface Report {
  id: string;
  title: string;
  status: ReportStatus;
  note: string | null;
  meta: ReportMeta;
  created_by: string;
  created_by_name: string | null;
  discord_sent_at: string | null;
  created_at: string;
  updated_at: string;
  lines: ReportLine[];
  lines_count: number;
  total_quantity: number;
  // заказ как задача («штаб» заказов)
  assignees: Assignee[];
  priority: Priority;
  /** YYYY-MM-DD или null. */
  due_date: string | null;
  tags: string[];
  operation_id: string | null;
  /** Доставлено (по строкам, не больше заказанного). */
  delivered_total: number;
  /** Кто вносил вклад — для «Мои задачи». */
  contributor_ids: string[];
}

export interface ReportLineInput {
  name: string;
  item_code?: string | null;
  quantity: number;
  unit: ItemUnit;
}

export const REPORT_STATUS_LABEL: Record<ReportStatus, MessageKey> = {
  open: "reports.status.open",
  in_progress: "reports.status.in_progress",
  done: "reports.status.done",
  cancelled: "reports.status.cancelled",
};

/** Зеркало REPORT_TRANSITIONS бэкенда (app/models/report.py). */
export const REPORT_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  // отменять больше нельзя — ненужный заказ удаляют
  open: ["in_progress", "done"],
  in_progress: ["open", "done"],
  done: ["in_progress"],
  cancelled: ["open"],
};

// ───────────────────────────── API ─────────────────────────────

interface ReportSaved {
  report: Report;
  message: string;
}

/** Журнал выполнения заказа (GET/POST/DELETE /reports/{id}/progress). */
export interface ProgressLine {
  line_id: string;
  name: string;
  name_ru?: string | null;
  name_en?: string | null;
  item_code: string | null;
  icon_url: string | null;
  unit: "crate" | "unit";
  ordered: number;
  delivered: number;
}
export interface Contribution {
  id: string;
  user_id: string;
  user_name: string | null;
  stockpile_id: string | null;
  stockpile_label: string | null;
  note: string | null;
  created_at: string;
  lines: { line_id: string; name: string; name_ru?: string | null; name_en?: string | null; icon_url: string | null; unit: "crate" | "unit"; quantity: number }[];
}

/** Журнал выполнения с названиями на языке интерфейса. */
export function localizeProgress(p: ReportProgress, locale: string): ReportProgress {
  return {
    ...p,
    lines: p.lines.map((l) => ({ ...l, name: lineName(l, locale) })),
    contributions: p.contributions.map((c) => ({ ...c, lines: c.lines.map((l) => ({ ...l, name: lineName(l, locale) })) })),
  };
}
export interface ReportProgress {
  report_id: string;
  lines: ProgressLine[];
  contributions: Contribution[];
  ordered_total: number;
  delivered_total: number;
  message: string | null;
}
export interface ContributionInput {
  lines: { line_id: string; quantity: number }[];
  stockpile_id?: string | null;
  stockpile_label?: string | null;
  note?: string | null;
}

export const reportApi = {
  async list(status?: ReportStatus[]): Promise<Report[]> {
    const page = await apiClient.get<Page<Report>>("/api/v1/reports", { params: { status, limit: 200 } });
    return page.items;
  },

  create(input: { title?: string; note?: string | null; meta?: ReportMeta; lines: ReportLineInput[] }): Promise<ReportSaved> {
    return apiClient.post<ReportSaved>("/api/v1/reports", { ...input, title: input.title || null });
  },

  setStatus(id: string, status: ReportStatus): Promise<ReportSaved> {
    return apiClient.post<ReportSaved>(`/api/v1/reports/${id}/status`, { status });
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete<void>(`/api/v1/reports/${id}`);
  },

  /** Участники клана, которых можно назначить исполнителями. */
  assignees(): Promise<Assignee[]> {
    return apiClient.get<Assignee[]>("/api/v1/reports/assignees");
  },
  setTask(id: string, patch: ReportTaskPatch): Promise<Report> {
    return apiClient.patch<Report>(`/api/v1/reports/${id}/task`, patch);
  },
  events(id: string): Promise<ReportEvent[]> {
    return apiClient.get<ReportEvent[]>(`/api/v1/reports/${id}/events`);
  },
  /** Комментарий; @роль и @участник получат письмо в почту сайта. */
  comment(id: string, text: string): Promise<ReportEvent> {
    return apiClient.post<ReportEvent>(`/api/v1/reports/${id}/comments`, { text });
  },
  /** Взять заказ себе / отказаться. */
  take(id: string, take: boolean): Promise<Report> {
    return apiClient.post<Report>(`/api/v1/reports/${id}/take`, { take });
  },

  progress(id: string): Promise<ReportProgress> {
    return apiClient.get<ReportProgress>(`/api/v1/reports/${id}/progress`);
  },
  contribute(id: string, input: ContributionInput): Promise<ReportProgress> {
    return apiClient.post<ReportProgress>(`/api/v1/reports/${id}/progress`, input);
  },
  removeContribution(id: string, contributionId: string): Promise<ReportProgress> {
    return apiClient.delete<ReportProgress>(`/api/v1/reports/${id}/progress/${contributionId}`);
  },

  /** Эмбед в канал клана; image — PNG первой страницы графического рапорта. */
  sendToDiscord(id: string, image?: Blob | null): Promise<ReportSaved> {
    const form = new FormData();
    if (image) form.append("image", image, "report.png");
    return apiClient.postForm<ReportSaved>(`/api/v1/reports/${id}/discord`, form);
  },
};

// ──────────────────────── черновик конструктора ────────────────────────

/** Строка конструктора заказа (черновик живёт в браузере до отправки рапорта). */
export interface DraftLine {
  name: string;
  item_code: string | null;
  quantity: number;
  unit: ItemUnit;
  icon_url: string | null;
}

export const orderDraft = {
  read: (scope = "guest"): DraftLine[] => readStorage<DraftLine[]>(`${STORAGE_KEYS.orderDraft}:${encodeURIComponent(scope)}`, []),
  write: (lines: DraftLine[], scope = "guest") => writeStorage(`${STORAGE_KEYS.orderDraft}:${encodeURIComponent(scope)}`, lines),
  /** «⤴ В конструктор» со страницы рапортов. */
  fromReport: (report: Report): DraftLine[] =>
    report.lines.map((l) => ({ name: l.name, item_code: l.item_code, quantity: l.quantity, unit: l.unit, icon_url: l.icon_url })),
};
