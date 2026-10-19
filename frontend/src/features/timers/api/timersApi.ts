import { apiClient } from "@/shared";
import type { CreatedTimerEnvelope, Page } from "@/shared";
import { toStockpile, type Stockpile, type StockpileReadDto } from "@/entities/stockpile";
import type { CreateTimerInput, FoxholeTimer, TimerReadDto, TimerState } from "@/features/timers/model/types";
import { toFoxholeTimer } from "@/features/timers/model/types";

export interface TimerResult {
  timer: FoxholeTimer;
  message: string;
}

export const timersApi = {
  async list(state?: TimerState): Promise<FoxholeTimer[]> {
    const page = await apiClient.get<Page<TimerReadDto>>("/api/v1/timers", {
      params: { state, limit: 200, offset: 0 },
    });
    return page.items.map(toFoxholeTimer);
  },

  async create(input: CreateTimerInput): Promise<TimerResult> {
    const endsAt = new Date(Date.now() + input.durationSeconds * 1000).toISOString();
    const created = await apiClient.post<CreatedTimerEnvelope<TimerReadDto>>("/api/v1/timers", {
      title: input.title,
      kind: input.kind,
      ends_at: endsAt,
      note: input.note || null,
      stockpile_id: input.stockpileId || null,
    });
    return { timer: toFoxholeTimer(created.timer), message: created.message };
  },

  /** Перезапуск окна той же длительности, что была у таймера. */
  async reset(timer: FoxholeTimer): Promise<TimerResult> {
    const endsAt = new Date(Date.now() + timer.durationSeconds * 1000).toISOString();
    return this.update(timer.id, { ends_at: endsAt, completed: false });
  },

  async setCompleted(id: string, completed: boolean): Promise<TimerResult> {
    return this.update(id, { completed });
  },

  async update(id: string, body: Record<string, unknown>): Promise<TimerResult> {
    const updated = await apiClient.patch<CreatedTimerEnvelope<TimerReadDto>>(`/api/v1/timers/${id}`, body);
    return { timer: toFoxholeTimer(updated.timer), message: updated.message };
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete<void>(`/api/v1/timers/${id}`);
  },

  /** Склады клана — для привязки таймера (stockpile_id). */
  async stockpileOptions(): Promise<Stockpile[]> {
    const page = await apiClient.get<Page<StockpileReadDto>>("/api/v1/stockpiles", {
      params: { limit: 200, offset: 0 },
    });
    return page.items.map(toStockpile);
  },
};
