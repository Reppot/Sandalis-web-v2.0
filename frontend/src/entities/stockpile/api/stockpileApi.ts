import { apiClient } from "@/shared";
import type { CreatedStockpileEnvelope, Page } from "@/shared";
import { toStockpile, toStockpileItem, type Stockpile, type StockpileItemReadDto, type StockpileKind, type StockpileReadDto } from "@/entities/stockpile/model/types";

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

  /** Содержимое склада. Запросы одного кадра склеиваются в один (раскрытые карточки «Складов»). */
  items(id: string): Promise<Stockpile["items"]> {
    return new Promise((resolve, reject) => {
      pendingItems.set(id, [...(pendingItems.get(id) ?? []), { resolve, reject }]);
      if (pendingItems.size === 1 && pendingItems.get(id)!.length === 1) queueMicrotask(flushItems);
    });
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

  /** Полная замена содержимого выгрузкой сканера (дубли кодов суммирует сервер; ящики и россыпь — раздельно). */
  async replaceContents(id: string, items: { item_code: string; quantity: number; unit?: "crate" | "unit" }[], source: SyncSource): Promise<StockpileResult> {
    const r = await apiClient.put<CreatedStockpileEnvelope<StockpileReadDto>>(`/api/v1/stockpiles/${id}/items`, { items, source });
    return { stockpile: toStockpile(r.stockpile), message: r.message };
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete<void>(`/api/v1/stockpiles/${id}`);
  },
};

type ItemsWaiter = { resolve: (items: Stockpile["items"]) => void; reject: (err: unknown) => void };
const pendingItems = new Map<string, ItemsWaiter[]>();

async function flushItems(): Promise<void> {
  const batch = new Map(pendingItems);
  pendingItems.clear();
  try {
    const r = await apiClient.get<Record<string, StockpileItemReadDto[]>>("/api/v1/stockpiles/contents", { params: { ids: [...batch.keys()].join(",") } });
    for (const [id, waiters] of batch) {
      const items = (r[id] ?? []).map(toStockpileItem);
      waiters.forEach((w) => w.resolve(items));
    }
  } catch (err) {
    batch.forEach((waiters) => waiters.forEach((w) => w.reject(err)));
  }
}
