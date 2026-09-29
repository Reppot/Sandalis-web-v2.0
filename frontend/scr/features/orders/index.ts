// public API фичи «заказы». Всё, чего здесь нет, —
// приватно: импортировать снаружи запрещено (см. eslint).
export { OrdersTable } from "./ui/orders-table";
export { OrderCard } from "./ui/order-card";
export { CreateOrderForm } from "./ui/create-order-form";

export { useOrders } from "./model/use-orders";
export type { Order, OrderStatus } from "./model/types";

// Внутренности — model/orders-mapping, api/dto, lib/format-tons —
// наружу не экспортируются. Их контракт может меняться свободно.
