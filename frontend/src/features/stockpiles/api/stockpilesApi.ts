import { apiClient } from "@/shared";
import type { Stockpile } from "@/entities/stockpile";
import type { CreateStockpileFormData } from "@/features/stockpiles/model/types";

export const stockpilesApi = {
  async list(): Promise<Stockpile[]> {
    return apiClient.get<Stockpile[]>("/api/v1/stockpiles");
  },

  async create(data: CreateStockpileFormData): Promise<Stockpile> {
    return apiClient.post<Stockpile>("/api/v1/stockpiles", {
      ...data,
      items: [],
    });
  },

  async updateItems(id: string, items: Stockpile["items"]): Promise<Stockpile> {
    return apiClient.put<Stockpile>(`/api/v1/stockpiles/${id}/items`, { items });
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/api/v1/stockpiles/${id}`);
  },
};