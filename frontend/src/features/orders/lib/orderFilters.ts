import type { ProductionOrder } from "@/entities/order";
import type { OrderFilterState } from "@/features/orders/model/types";

export function filterOrders(orders: ProductionOrder[], filters: OrderFilterState): ProductionOrder[] {
  return orders.filter((order) => {
    const matchesStatus = filters.status === "all" || order.status === filters.status;
    const matchesSearch =
      filters.searchQuery === "" ||
      order.destination.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
      order.items.some((item) => item.itemId.toLowerCase().includes(filters.searchQuery.toLowerCase())) ||
      (order.notes && order.notes.toLowerCase().includes(filters.searchQuery.toLowerCase()));

    return matchesStatus && matchesSearch;
  });
}