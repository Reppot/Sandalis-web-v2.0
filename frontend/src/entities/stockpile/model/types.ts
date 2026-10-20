export interface StockpileItem {
  id: string;
  itemCode: string;
  quantity: number;
  name: string | null;
  nameEn: string | null;
  iconUrl: string | null;
}

export interface Stockpile {
  id: string;
  name: string;
  region: string;
  itemsCount: number;
  totalQuantity: number;
  lastSyncSource: string | null;
  lastSyncAt: string | null;
  items: StockpileItem[];
}

export interface StockpileItemReadDto {
  id: string;
  item_code: string;
  quantity: number;
  name?: string | null;
  name_en?: string | null;
  icon_url?: string | null;
}

export interface StockpileReadDto {
  id: string;
  name: string;
  region: string;
  items_count?: number;
  total_quantity?: number;
  last_sync_source?: string | null;
  last_sync_at?: string | null;
  items?: StockpileItemReadDto[];
}

export function toStockpileItem(dto: StockpileItemReadDto): StockpileItem {
  return { id: dto.id, itemCode: dto.item_code, quantity: dto.quantity, name: dto.name ?? null, nameEn: dto.name_en ?? null, iconUrl: dto.icon_url ?? null };
}

export function toStockpile(dto: StockpileReadDto): Stockpile {
  const items = (dto.items ?? []).map(toStockpileItem);
  return {
    id: dto.id,
    name: dto.name,
    region: dto.region,
    itemsCount: dto.items_count ?? items.length,
    totalQuantity: dto.total_quantity ?? items.reduce((sum, item) => sum + item.quantity, 0),
    lastSyncSource: dto.last_sync_source ?? null,
    lastSyncAt: dto.last_sync_at ?? null,
    items,
  };
}
