export type OrderStatus = "pending" | "processing" | "completed" | "cancelled";

export interface OrderItem {
  itemId: string;
  quantity: number;         // Требуемое количество штук (или ящиков, смотря по типу)
  completedQuantity: number;
}

export interface ProductionOrder {
  id: string;
  creatorId: string;        // Ссылка на DiscordID создателя
  assigneeId: string | null;// Кто взял в работу
  status: OrderStatus;
  items: OrderItem[];
  destination: string;      // Название склада/региона доставки
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}