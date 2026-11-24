import { apiClient } from "@/shared";
import { POINT_ICON, POINT_KINDS, type PointKind, type Snapshot } from "@/features/planning/model/plan";

export { POINT_ICON, POINT_KINDS, type PointKind };

/** Снимок карты в операции — то же, что снимок «Планирования», без своего id. */
export type OperationSnapshot = Pick<Snapshot, "name" | "rect" | "war" | "phase" | "regions" | "frontline" | "shapes">;

export type AttendStatus = "go" | "maybe" | "no";
export type Outcome = "success" | "partial" | "fail";
/** Разделы брифинга, которые командир может скрыть. */
export type BriefSection = "note" | "stages" | "points" | "roles" | "squads" | "people" | "supply" | "maps";
export const BRIEF_SECTIONS: BriefSection[] = ["note", "stages", "points", "roles", "squads", "people", "supply", "maps"];

export interface Participant {
  user_id: string;
  name: string;
  at: string;
  status: AttendStatus;
  role: string | null;
  squad: string | null;
  /** Явка после операции: null — не отмечали. */
  attended: boolean | null;
}

export interface PlanRole { id: string; name: string; slots: number }
export interface PlanSquad { id: string; name: string; leader_id: string | null }
export interface PlanStage { id: string; time: string; title: string; note: string; owner_id: string | null; done: boolean; brief: boolean }
/** Точка из «Планирования» (метка «Точка» на снимке); snapshot — номер снимка операции. */
export interface PlanPoint { id: string; kind: PointKind; label: string; note: string; brief: boolean; snapshot: number | null }
export interface Debrief { outcome: Outcome | null; text: string }

export interface OperationPlan {
  roles: PlanRole[];
  squads: PlanSquad[];
  stages: PlanStage[];
  points: PlanPoint[];
  hidden: BriefSection[];
  debrief: Debrief;
}
export type PlanInput = Omit<OperationPlan, "debrief">;

export interface SupplyLine { name: string; item_code: string | null; unit: "crate" | "unit"; quantity: number; delivered: number }
export interface SupplyRow { report_id: string; title: string; status: string; delivered: number; ordered: number; lines: SupplyLine[] }

/** Нехватка по предметам во всех заказах операции: сколько не довезено и в скольких заказах (открытых / закрытых). */
export interface Shortage { key: string; name: string; item_code: string | null; unit: "crate" | "unit"; missing: number; open: number; closed: number }
export function shortages(rows: SupplyRow[]): Shortage[] {
  const map = new Map<string, Shortage>();
  for (const r of rows) {
    const closed = r.status === "done" || r.status === "cancelled";
    for (const l of r.lines ?? []) {
      const missing = l.quantity - l.delivered;
      if (missing <= 0) continue;
      const key = `${l.item_code ?? l.name}|${l.unit}`;
      const cur = map.get(key) ?? { key, name: l.name, item_code: l.item_code, unit: l.unit, missing: 0, open: 0, closed: 0 };
      cur.missing += missing;
      if (closed) cur.closed += missing;
      else cur.open += missing;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.missing - a.missing);
}

export interface Operation {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  note: string;
  /** Время начала (ISO с поясом) — для события и напоминания в Discord. */
  starts_at?: string | null;
  report_ids: string[];
  participants: Participant[];
  plan: OperationPlan;
  /** Названия снимков карты (пусто — операция без карты). */
  snapshot_names: string[];
  author_id: string;
  author_name: string;
  created_at: string;
  can_edit: boolean;
}

export interface OperationFull extends Operation {
  snapshots: OperationSnapshot[];
  /** Заказы к операции: привезено / заказано ящиков. */
  supply: SupplyRow[];
  /** Участники терминала, не ответившие на опрос. */
  silent: { user_id: string; name: string }[];
}

export interface OperationList {
  can_create: boolean;
  operations: Operation[];
}

export interface OperationInput {
  title: string;
  date: string;
  note: string;
  starts_at?: string | null;
}

/** «ЧЧ:ММ» в часовом поясе браузера → момент начала (ISO) для дня date. */
export const startsAt = (date: string, hhmm: string): string | null => (hhmm ? new Date(`${date}T${hhmm}`).toISOString() : null);
/** Время начала операции «ЧЧ:ММ» в часовом поясе браузера (или ""). */
export const startTime = (op: Pick<Operation, "starts_at">): string => {
  if (!op.starts_at) return "";
  const d = new Date(op.starts_at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const BASE = "/api/v1/clan/operations";

export const operationsApi = {
  list: () => apiClient.get<OperationList>(BASE),
  get: (id: string) => apiClient.get<OperationFull>(`${BASE}/${id}`),
  create: (body: OperationInput & { snapshots?: OperationSnapshot[] }) => apiClient.post<Operation>(BASE, body),
  addSnapshots: (id: string, snapshots: OperationSnapshot[]) => apiClient.post<Operation>(`${BASE}/${id}/snapshots`, { snapshots }),
  update: (id: string, body: OperationInput) => apiClient.put<Operation>(`${BASE}/${id}`, body),
  remove: (id: string) => apiClient.delete<void>(`${BASE}/${id}`),
  /** Ответ на опрос; status null — снять ответ. */
  attend: (id: string, status: AttendStatus | null, role?: string | null) => apiClient.post<Operation>(`${BASE}/${id}/attend`, { status, role: role ?? null }),
  savePlan: (id: string, plan: PlanInput) => apiClient.put<Operation>(`${BASE}/${id}/plan`, plan),
  saveDebrief: (id: string, debrief: Debrief) => apiClient.put<Operation>(`${BASE}/${id}/debrief`, debrief),
  assign: (id: string, body: { user_id: string; role?: string | null; squad?: string | null; attended?: boolean | null }) =>
    apiClient.post<Operation>(`${BASE}/${id}/assign`, body),
  stageDone: (id: string, stage: string, done: boolean) => apiClient.post<Operation>(`${BASE}/${id}/stages/${stage}`, { done }),
  /** Брифинг в Discord; images — PNG снимков карты. */
  postBrief: (id: string, images: Blob[] = []) => {
    const form = new FormData();
    images.forEach((b, i) => form.append("images", b, `map-${i + 1}.png`));
    return apiClient.postForm<{ posted: boolean }>(`${BASE}/${id}/brief`, form);
  },
};

/** Снимок «Планирования» → то, что хранится в операции. */
export const toOperationSnapshot = (s: Snapshot): OperationSnapshot => ({ name: s.name, rect: s.rect, war: s.war, phase: s.phase, regions: s.regions, frontline: s.frontline, shapes: s.shapes });

/** Снимок операции → снимок для просмотрщика «Планирования». */
export const toViewerSnapshot = (op: Operation, snap: OperationSnapshot, i: number): Snapshot => ({
  ...snap,
  id: `${op.id}:${i}`,
  name: snap.name || op.title,
  created: op.created_at,
});

/* ───────────── даты (локальные, без часовых поясов) ───────────── */

export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => isoDate(new Date());

/** Операции по датам: { "2026-11-02": [op, …] }. */
export function byDate(list: Operation[]) {
  const map = new Map<string, Operation[]>();
  for (const op of list) map.set(op.date, [...(map.get(op.date) ?? []), op]);
  return map;
}

/** Новый короткий id для пункта плана. */
export const planId = () => Math.random().toString(36).slice(2, 10);
/** План без итогов — то, что уходит в PUT /plan. */
export const planInput = ({ debrief: _d, ...rest }: OperationPlan): PlanInput => rest;
export const going = (op: Pick<Operation, "participants">) => op.participants.filter((p) => p.status === "go");
/** Ближайший невыполненный этап. */
export const nextStage = (op: Pick<Operation, "plan">) => op.plan.stages.find((s) => !s.done) ?? null;
