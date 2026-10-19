import { apiClient } from "@/shared";
import type { CreatedStockpileEnvelope, Page, SavedItemEnvelope } from "@/shared";
import type { Stockpile, StockpileItemReadDto, StockpileReadDto } from "@/entities/stockpile";
import { toStockpile } from "@/entities/stockpile";
import type { CreateStockpileFormData } from "@/features/stockpiles/model/types";

export interface StockpileResult {
  stockpile: Stockpile;
  message: string;
}

export const stockpilesApi = {
  async list(): Promise<Stockpile[]> {
    const page = await apiClient.get<Page<StockpileReadDto>>("/api/v1/stockpiles", {
      params: { limit: 200, offset: 0 },
    });
    return page.items.map(toStockpile);
  },

  /** StockpileDetailRead: склад + позиции. */
  async get(id: string): Promise<Stockpile> {
    const dto = await apiClient.get<StockpileReadDto>(`/api/v1/stockpiles/${id}`);
    return toStockpile(dto);
  },

  async create(data: CreateStockpileFormData): Promise<StockpileResult> {
    const created = await apiClient.post<CreatedStockpileEnvelope<StockpileReadDto>>("/api/v1/stockpiles", {
      name: data.name,
      region: data.region,
    });
    return { stockpile: toStockpile(created.stockpile), message: created.message };
  },

  async update(id: string, data: Partial<CreateStockpileFormData>): Promise<StockpileResult> {
    const updated = await apiClient.patch<CreatedStockpileEnvelope<StockpileReadDto>>(
      `/api/v1/stockpiles/${id}`,
      data
    );
    return { stockpile: toStockpile(updated.stockpile), message: updated.message };
  },

  /** Идемпотентный upsert: quantity — целевое абсолютное значение. */
  async upsertItem(id: string, itemCode: string, quantity: number): Promise<string> {
    const saved = await apiClient.post<SavedItemEnvelope<StockpileItemReadDto>>(
      `/api/v1/stockpiles/${id}/items`,
      { item_code: itemCode, quantity }
    );
    return saved.message;
  },

  async setItemQuantity(id: string, itemCode: string, quantity: number): Promise<string> {
    const saved = await apiClient.patch<SavedItemEnvelope<StockpileItemReadDto>>(
      `/api/v1/stockpiles/${id}/items/${encodeURIComponent(itemCode)}`,
      { quantity }
    );
    return saved.message;
  },

  async deleteItem(id: string, itemCode: string): Promise<void> {
    await apiClient.delete<void>(`/api/v1/stockpiles/${id}/items/${encodeURIComponent(itemCode)}`);
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete<void>(`/api/v1/stockpiles/${id}`);
  },
};
