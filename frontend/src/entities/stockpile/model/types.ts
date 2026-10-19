export interface StockpileItem {
  id: string;
  itemCode: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface Stockpile {
  id: string;
  name: string;
  region: string;
  createdAt: string;
  updatedAt: string;
  itemsCount: number;
  totalQuantity: number;
  items: StockpileItem[];
}

export interface StockpileReadDto {
  id: string;
  name: string;
  region: string;
  created_at: string;
  updated_at: string;
  items_count?: number;
  total_quantity?: number;
  items?: StockpileItemReadDto[];
}

export interface StockpileItemReadDto {
  id: string;
  item_code: string;
  quantity: number;
  created_at: string;
  updated_at: string;
}

export function toStockpileItem(dto: StockpileItemReadDto): StockpileItem {
  return {
    id: dto.id,
    itemCode: dto.item_code,
    quantity: dto.quantity,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export function toStockpile(dto: StockpileReadDto): Stockpile {
  const items = (dto.items ?? []).map(toStockpileItem);
  return {
    id: dto.id,
    name: dto.name,
    region: dto.region,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    itemsCount: dto.items_count ?? items.length,
    totalQuantity: dto.total_quantity ?? items.reduce((sum, item) => sum + item.quantity, 0),
    items,
  };
}
