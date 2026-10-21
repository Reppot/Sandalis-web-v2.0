import { apiClient } from "@/shared";
import type { CreatedStockpileEnvelope, Page } from "@/shared";
import { toStockpile, type Stockpile, type StockpileKind, type StockpileReadDto } from "@/entities/stockpile/model/types";

export type SyncSource = "json" | "txt" | "clipboard" | "xlsx" | "scan" | "manual";

/** Описание склада для клана (snake_case — как ждёт API). */
export interface StockpileDetails {
  town?: string | null;
  kind?: StockpileKind | null;
  access_code?: string | null;
}

export interface StockpileResult {
  stockpile: Stockpile;
  message: string;
}

/** Склады клана: используются монитором склада (Заказы) и таймерами. */
export const stockpileApi = {
  async list(): Promise<Stockpile[]> {
    const page = await apiClient.get<Page<StockpileReadDto>>("/api/v1/stockpiles", { params: { limit: 200 } });
    return page.items.map(toStockpile);
  },

  async get(id: string): Promise<Stockpile> {
    return toStockpile(await apiClient.get<StockpileReadDto>(`/api/v1/stockpiles/${id}`));
  },

  async create(name: string, region: string, details: StockpileDetails = {}): Promise<StockpileResult> {
    const r = await apiClient.post<CreatedStockpileEnvelope<StockpileReadDto>>("/api/v1/stockpiles", { name, region, ...details });
    return { stockpile: toStockpile(r.stockpile), message: r.message };
  },

  async update(id: string, data: { name?: string; region?: string } & StockpileDetails): Promise<StockpileResult> {
    const r = await apiClient.patch<CreatedStockpileEnvelope<StockpileReadDto>>(`/api/v1/stockpiles/${id}`, data);
    return { stockpile: toStockpile(r.stockpile), message: r.message };
  },

  /** Полная замена содержимого выгрузкой сканера (дубли кодов суммирует сервер). */
  async replaceContents(id: string, items: { item_code: string; quantity: number }[], source: SyncSource): Promise<StockpileResult> {
    const r = await apiClient.put<CreatedStockpileEnvelope<StockpileReadDto>>(`/api/v1/stockpiles/${id}/items`, { items, source });
    return { stockpile: toStockpile(r.stockpile), message: r.message };
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete<void>(`/api/v1/stockpiles/${id}`);
  },
};
