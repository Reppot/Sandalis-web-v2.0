import { apiClient } from "@/shared";
import type { FoxholeItem } from "@/entities/item";

export const codesApi = {
  async list(): Promise<FoxholeItem[]> {
    return apiClient.get<FoxholeItem[]>("/api/v1/items");
  },
};