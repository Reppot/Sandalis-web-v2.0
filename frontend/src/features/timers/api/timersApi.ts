import { apiClient } from "@/shared";
import type { FoxholeTimer, TimerType } from "@/features/timers/model/types";

export const timersApi = {
  async list(): Promise<FoxholeTimer[]> {
    return apiClient.get<FoxholeTimer[]>("/api/v1/timers");
  },

  async create(name: string, type: TimerType, durationSeconds: number): Promise<FoxholeTimer> {
    return apiClient.post<FoxholeTimer>("/api/v1/timers", { name, type, durationSeconds });
  },

  async reset(id: string): Promise<FoxholeTimer> {
    return apiClient.post<FoxholeTimer>(`/api/v1/timers/${id}/reset`);
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/api/v1/timers/${id}`);
  },
};