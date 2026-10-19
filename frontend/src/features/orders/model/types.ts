import type { OrderStatus } from "@/entities/order";

export interface OrderFilterState {
  status: OrderStatus | "all";
  /** Только заказы, где я исполнитель (фильтр assignee_id на сервере). */
  mineOnly: boolean;
  searchQuery: string;
}

export interface CreateOrderFormData {
  title: string;
  itemCode: string;
  quantity: number;
  notes: string;
  assigneeId: string;
}

/** Поля backend `OrderUpdate`; undefined = не менять. */
export interface OrderPatch {
  title?: string;
  quantity?: number;
  produced?: number;
  notes?: string | null;
  assigneeId?: string | null;
}

/** Зеркало backend `ALLOWED_TRANSITIONS` (app/models/order.py). */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["queued", "cancelled"],
  queued: ["in_progress", "cancelled"],
  in_progress: ["done", "cancelled"],
  done: [],
  cancelled: [],
};
