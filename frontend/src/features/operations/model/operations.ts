import { apiClient } from "@/shared";
import type { Snapshot } from "@/features/planning/model/plan";

/** Снимок карты в операции — то же, что снимок «Планирования», без своего id. */
export type OperationSnapshot = Pick<Snapshot, "name" | "rect" | "war" | "phase" | "regions" | "shapes">;

export interface Participant {
  user_id: string;
  name: string;
  at: string;
}

export interface Operation {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  note: string;
  report_ids: string[];
  participants: Participant[];
  /** Названия снимков карты (пусто — операция без карты). */
  snapshot_names: string[];
  author_id: string;
  author_name: string;
  created_at: string;
  can_edit: boolean;
}

export interface OperationFull extends Operation {
  snapshots: OperationSnapshot[];
}

export interface OperationList {
  can_create: boolean;
  operations: Operation[];
}

export interface OperationInput {
  title: string;
  date: string;
  note: string;
}

const BASE = "/api/v1/clan/operations";

export const operationsApi = {
  list: () => apiClient.get<OperationList>(BASE),
  get: (id: string) => apiClient.get<OperationFull>(`${BASE}/${id}`),
  create: (body: OperationInput & { snapshots?: OperationSnapshot[] }) => apiClient.post<Operation>(BASE, body),
  addSnapshots: (id: string, snapshots: OperationSnapshot[]) => apiClient.post<Operation>(`${BASE}/${id}/snapshots`, { snapshots }),
  update: (id: string, body: OperationInput) => apiClient.put<Operation>(`${BASE}/${id}`, body),
  remove: (id: string) => apiClient.delete<void>(`${BASE}/${id}`),
  attend: (id: string, going: boolean) => apiClient.post<Operation>(`${BASE}/${id}/attend`, { going }),
};

/** Снимок «Планирования» → то, что хранится в операции. */
export const toOperationSnapshot = (s: Snapshot): OperationSnapshot => ({ name: s.name, rect: s.rect, war: s.war, phase: s.phase, regions: s.regions, shapes: s.shapes });

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
