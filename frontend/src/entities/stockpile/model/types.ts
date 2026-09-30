export interface StockpileItem {
  itemId: string;
  quantity: number;
}

export interface Stockpile {
  id: string;
  name: string;             // Название склада (например, "Seaport - Kirknell")
  location: string;         // Карта/Локация
  code: string | null;      // Резервный код склада (если есть)
  items: StockpileItem[];
  lastUpdatedBy: string;    // DiscordID обновившего
  updatedAt: string;
}