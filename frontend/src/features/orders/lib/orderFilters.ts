import type { ProductionOrder } from "@/entities/order";
import type { OrderFilterState } from "@/features/orders/model/types";

/** Текстовый поиск — на клиенте; статус и «мои» уже отфильтрованы сервером. */
export function filterOrders(orders: ProductionOrder[], filters: OrderFilterState): ProductionOrder[] {
  const q = filters.searchQuery.toLowerCase().trim();
  if (q === "") return orders;
  return orders.filter(
    (order) =>
      order.title.toLowerCase().includes(q) ||
      order.itemCode.toLowerCase().includes(q) ||
      (order.notes?.toLowerCase().includes(q) ?? false)
  );
}
