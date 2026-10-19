import { apiClient } from "@/shared";
import type { CreatedTimerEnvelope, Page } from "@/shared";

/** Таймер деспавна (DTO сервера как есть). */
export interface Timer {
  id: string;
  title: string;
  kind: string;
  note: string | null;
  stockpile_id: string | null;
  starts_at: string;
  ends_at: string;
  duration_seconds: number;
  completed_at: string | null;
  created_by: string;
}

export interface TimerEvent {
  id: string;
  timer_id: string;
  message: string;
  created_by: string;
  created_at: string;
}

interface Saved {
  timer: Timer;
  message: string;
}

export const timersApi = {
  async list(): Promise<Timer[]> {
    const page = await apiClient.get<Page<Timer>>("/api/v1/timers", { params: { limit: 200 } });
    return page.items;
  },

  create(input: { title: string; durationSeconds: number; stockpileId?: string | null; note?: string | null }): Promise<Saved> {
    return apiClient.post<CreatedTimerEnvelope<Timer>>("/api/v1/timers", {
      title: input.title,
      kind: "stockpile_decay",
      ends_at: new Date(Date.now() + input.durationSeconds * 1000).toISOString(),
      duration_seconds: input.durationSeconds,
      stockpile_id: input.stockpileId ?? null,
      note: input.note ?? null,
    });
  },

  /** Окно заново от «сейчас»: «Сбросить на 48 ч» и «Задать таймер» Д/Ч/М. */
  restart(id: string, durationSeconds: number): Promise<Saved> {
    return apiClient.patch<Saved>(`/api/v1/timers/${id}`, { restart: true, duration_seconds: durationSeconds });
  },

  setCompleted(id: string, completed: boolean): Promise<Saved> {
    return apiClient.patch<Saved>(`/api/v1/timers/${id}`, { completed });
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete<void>(`/api/v1/timers/${id}`);
  },

  events(id: string): Promise<TimerEvent[]> {
    return apiClient.get<TimerEvent[]>(`/api/v1/timers/${id}/events`);
  },

  addEvent(id: string, message: string): Promise<{ event: TimerEvent; message: string }> {
    return apiClient.post(`/api/v1/timers/${id}/events`, { message });
  },
};
