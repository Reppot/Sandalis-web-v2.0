"use client";

import * as React from "react";
import type { OrderStatus, ProductionOrder } from "@/entities/order";
import { Button, Spinner, errorText, useToast } from "@/shared";
import { ordersApi } from "@/features/orders/api/ordersApi";
import { filterOrders } from "@/features/orders/lib/orderFilters";
import type { OrderFilterState, CreateOrderFormData, OrderPatch } from "@/features/orders/model/types";
import { OrderCard } from "@/features/orders/ui/OrderCard";
import { CreateOrderModal } from "@/features/orders/ui/CreateOrderModal";
import { EditOrderModal } from "@/features/orders/ui/EditOrderModal";
import { OrderFilters } from "@/features/orders/ui/OrderFilters";
import { Plus } from "lucide-react";

interface OrdersWorkspaceProps {
  canWrite: boolean;
  canDelete: boolean;
  currentUserId: string | null;
}

export const OrdersWorkspace: React.FC<OrdersWorkspaceProps> = ({ canWrite, canDelete, currentUserId }) => {
  const notify = useToast();
  const [orders, setOrders] = React.useState<ProductionOrder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ProductionOrder | null>(null);
  const [filters, setFilters] = React.useState<OrderFilterState>({
    status: "all",
    mineOnly: false,
    searchQuery: "",
  });

  const loadOrders = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await ordersApi.list({
        status: filters.status === "all" ? undefined : filters.status,
        assigneeId: filters.mineOnly && currentUserId ? currentUserId : undefined,
      });
      setOrders(data);
      setError(null);
    } catch (err) {
      setOrders([]);
      setError(errorText(err, "Не удалось загрузить заказы"));
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.mineOnly, currentUserId]);

  React.useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const replace = (updated: ProductionOrder) =>
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));

  const handleCreate = async (data: CreateOrderFormData) => {
    const { order, message } = await ordersApi.create(data);
    setOrders((prev) => [order, ...prev]);
    notify(message);
  };

  const handleStatusChange = async (id: string, status: OrderStatus) => {
    try {
      const { order, message } = await ordersApi.updateStatus(id, status);
      replace(order);
      notify(message);
    } catch (err) {
      notify(errorText(err, "Не удалось сменить статус"), "error");
    }
  };

  const handleAssign = async (id: string, assigneeId: string | null) => {
    try {
      replace(await ordersApi.update(id, { assigneeId }));
      notify(assigneeId ? "Заказ закреплён за вами" : "Исполнитель снят");
    } catch (err) {
      notify(errorText(err, "Не удалось назначить исполнителя"), "error");
    }
  };

  const handleEdit = async (id: string, patch: OrderPatch) => {
    replace(await ordersApi.update(id, patch));
    notify("Заказ сохранён");
  };

  const handleDelete = async (order: ProductionOrder) => {
    if (!window.confirm(`Удалить заказ «${order.title}»?`)) return;
    try {
      await ordersApi.delete(order.id);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      notify("Заказ удалён");
    } catch (err) {
      notify(errorText(err, "Не удалось удалить заказ"), "error");
    }
  };

  const filteredOrders = filterOrders(orders, filters);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-sindaris-border">
        <div>
          <h2 className="text-xl font-bold text-sindaris-accent tracking-wide">ЗАКАЗЫ НА ЛОГИСТИКУ</h2>
          <p className="text-xs text-sindaris-muted">Очередь снабжения и заявок клана</p>
        </div>
        {canWrite && (
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Новый заказ
          </Button>
        )}
      </div>

      <OrderFilters filters={filters} onChange={setFilters} />

      {error && <p className="text-xs text-red-400">{error}</p>}

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="p-12 text-center rounded-lg border border-dashed border-sindaris-border text-sindaris-muted font-mono">
          {canWrite
            ? "Заказов не найдено. Нажмите «Новый заказ», чтобы создать первую заявку."
            : "Заказов не найдено."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              currentUserId={currentUserId}
              canWrite={canWrite}
              canDelete={canDelete}
              onStatusChange={(id, status) => void handleStatusChange(id, status)}
              onAssign={(id, assignee) => void handleAssign(id, assignee)}
              onEdit={setEditing}
              onDelete={(o) => void handleDelete(o)}
            />
          ))}
        </div>
      )}

      <CreateOrderModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreate}
        currentUserId={currentUserId}
      />
      <EditOrderModal order={editing} onClose={() => setEditing(null)} onSubmit={handleEdit} />
    </div>
  );
};
