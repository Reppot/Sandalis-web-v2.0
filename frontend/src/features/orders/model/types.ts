import type { OrderStatus, ProductionOrder } from "@/entities/order";

export interface OrderFilterState {
  status: OrderStatus | "all";
  searchQuery: string;
}

export interface CreateOrderFormData {
  itemId: string;
  quantity: number;
  destination: string;
  notes: string;
}