import { CreateOrderForm, OrdersTable, useOrders } from "@/features/orders";

// Страница — тонкая сборка: ноль запросов, ноль бизнес-правил,
// только композиция виджетов фичи.
export default function OrdersPage() {
  const { orders, isLoading, createOrder } = useOrders();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Заказы полка</h1>
        <CreateOrderForm onSubmit={createOrder} />
      </header>
      <OrdersTable orders={orders} isLoading={isLoading} />
    </main>
  );
}
