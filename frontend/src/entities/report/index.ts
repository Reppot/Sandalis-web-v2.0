import { STORAGE_KEYS, apiClient, readStorage, writeStorage } from "@/shared";
import type { MessageKey, Page } from "@/shared";
import type { ItemUnit } from "@/entities/item";

export type ReportStatus = "open" | "in_progress" | "done" | "cancelled";

export interface ReportMeta {
  region?: string | null;
  type?: string | null;
  stockpile?: string | null;
}

export interface ReportLine {
  id: string;
  position: number;
  name: string;
  item_code: string | null;
  quantity: number;
  unit: ItemUnit;
  icon_url: string | null;
}

/** Рапорт снабжения (GET /api/v1/reports) — DTO сервера используется как есть. */
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
  open: ["in_progress", "done", "cancelled"],
  in_progress: ["open", "done", "cancelled"],
  done: ["in_progress"],
  cancelled: ["open"],
};

// ───────────────────────────── API ─────────────────────────────

interface ReportSaved {
  report: Report;
  message: string;
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
  read: (): DraftLine[] => readStorage<DraftLine[]>(STORAGE_KEYS.orderDraft, []),
  write: (lines: DraftLine[]) => writeStorage(STORAGE_KEYS.orderDraft, lines),
  /** «⤴ В конструктор» со страницы рапортов. */
  fromReport: (report: Report): DraftLine[] =>
    report.lines.map((l) => ({ name: l.name, item_code: l.item_code, quantity: l.quantity, unit: l.unit, icon_url: l.icon_url })),
};
