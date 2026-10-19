import { catalogApi, type CatalogPage } from "@/entities/item";

export const CODES_PAGE_SIZE = 60;

/** Поиск по каталогу: GET /api/v1/items (фильтрация и сортировка — на сервере). */
export const codesApi = {
  list(query = "", category?: string, offset = 0): Promise<CatalogPage> {
    return catalogApi.search({ query, category, limit: CODES_PAGE_SIZE, offset });
  },
};
