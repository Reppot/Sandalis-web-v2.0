import { apiClient } from "@/shared";
import type { Page } from "@/shared";
import { toFoxholeItem, type CatalogItemDto, type FoxholeItem } from "@/entities/item/model/types";

export interface CatalogSearch {
  query?: string;
  category?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface CatalogPage {
  items: FoxholeItem[];
  total: number;
  limit: number;
  offset: number;
}

/** Глобальный каталог предметов: GET /api/v1/items (пагинация, до 200 за раз). */
export const catalogApi = {
  async search({ query = "", category, activeOnly, limit = 50, offset = 0 }: CatalogSearch = {}): Promise<CatalogPage> {
    const page = await apiClient.get<Page<CatalogItemDto>>("/api/v1/items", {
      params: { query, category, active_only: activeOnly, limit, offset },
    });
    return { ...page, items: page.items.map(toFoxholeItem) };
  },

  async get(code: string): Promise<FoxholeItem> {
    const dto = await apiClient.get<CatalogItemDto>(`/api/v1/items/${encodeURIComponent(code)}`);
    return toFoxholeItem(dto);
  },
};
