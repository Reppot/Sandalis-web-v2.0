import type { Order } from "../model/types";
import { OrderCard } from "./order-card";

interface OrdersTableProps {
  orders: Order[];
  isLoading?: boolean;
}

export function OrdersTable({ orders, isLoading = false }: OrdersTableProps) {
  if (isLoading) return <p className="text-zinc-500">Загружаем заказы…</p>;
  if (orders.length === 0) {
    return <p>Открытых заказов нет — клан может выдохнуть.</p>;
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </ul>
  );
}
