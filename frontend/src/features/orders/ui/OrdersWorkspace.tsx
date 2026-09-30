"use client";

import * as React from "react";
import type { ProductionOrder, OrderStatus } from "@/entities/order";
import { Button, Spinner } from "@/shared";
import { ordersApi } from "@/features/orders/api/ordersApi";
import { filterOrders } from "@/features/orders/lib/orderFilters";
import type { OrderFilterState, CreateOrderFormData } from "@/features/orders/model/types";
import { OrderCard } from "@/features/orders/ui/OrderCard";
import { CreateOrderModal } from "@/features/orders/ui/CreateOrderModal";
import { OrderFilters } from "@/features/orders/ui/OrderFilters";
import { Plus } from "lucide-react";

export const OrdersWorkspace: React.FC = () => {
  const [orders, setOrders] = React.useState<ProductionOrder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<OrderFilterState>({
    status: "all",
    searchQuery: "",
  });

  const loadOrders = React.useCallback(async () => {
    try {
      const data = await ordersApi.list();
      setOrders(data);
    } catch {
      // Инициализация пустым списком в оффлайн режиме
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleCreate = async (data: CreateOrderFormData) => {
    const newOrder = await ordersApi.create(data);
    setOrders((prev) => [newOrder, ...prev]);
  };

  const handleStatusChange = async (id: string, status: OrderStatus) => {
    const updated = await ordersApi.updateStatus(id, status);
    setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
  };

  const handleClaim = async (id: string) => {
    const updated = await ordersApi.claim(id);
    setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
  };

  const filteredOrders = filterOrders(orders, filters);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-sindaris-border">
        <div>
          <h2 className="text-xl font-bold text-sindaris-accent tracking-wide">ЗАКАЗЫ НА ЛОГИСТИКУ</h2>
          <p className="text-xs text-sindaris-muted">Очередь снабжения и заявок клана</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Новый заказ
        </Button>
      </div>

      <OrderFilters filters={filters} onChange={setFilters} />

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="p-12 text-center rounded-lg border border-dashed border-sindaris-border text-sindaris-muted font-mono">
          Заказов не найдено. Нажмите «Новый заказ», чтобы создать первую заявку.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onStatusChange={handleStatusChange}
              onClaim={handleClaim}
            />
          ))}
        </div>
      )}

      <CreateOrderModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
};