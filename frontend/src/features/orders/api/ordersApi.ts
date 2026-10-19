import { apiClient } from "@/shared";
import type { CreatedOrderEnvelope, Page } from "@/shared";
import type { OrderStatus, ProductionOrder, OrderReadDto } from "@/entities/order";
import { toProductionOrder } from "@/entities/order";
import type { CreateOrderFormData, OrderPatch } from "@/features/orders/model/types";

export interface OrderResult {
  order: ProductionOrder;
  message: string;
}

export interface OrderListQuery {
  status?: OrderStatus;
  assigneeId?: string;
}

export const ordersApi = {
  async list({ status, assigneeId }: OrderListQuery = {}): Promise<ProductionOrder[]> {
    const page = await apiClient.get<Page<OrderReadDto>>("/api/v1/orders", {
      params: { status, assignee_id: assigneeId, limit: 200, offset: 0 },
    });
    return page.items.map(toProductionOrder);
  },

  async create(data: CreateOrderFormData): Promise<OrderResult> {
    const created = await apiClient.post<CreatedOrderEnvelope<OrderReadDto>>("/api/v1/orders", {
      title: data.title,
      item_code: data.itemCode,
      quantity: data.quantity,
      notes: data.notes || null,
      assignee_id: data.assigneeId || null,
    });
    return { order: toProductionOrder(created.order), message: created.message };
  },

  /** PATCH отправляет только переданные поля (null = очистить). */
  async update(orderId: string, patch: OrderPatch): Promise<ProductionOrder> {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.quantity !== undefined) body.quantity = patch.quantity;
    if (patch.produced !== undefined) body.produced = patch.produced;
    if (patch.notes !== undefined) body.notes = patch.notes;
    if (patch.assigneeId !== undefined) body.assignee_id = patch.assigneeId;
    const dto = await apiClient.patch<OrderReadDto>(`/api/v1/orders/${orderId}`, body);
    return toProductionOrder(dto);
  },

  async updateStatus(orderId: string, status: OrderStatus): Promise<OrderResult> {
    const changed = await apiClient.post<CreatedOrderEnvelope<OrderReadDto>>(
      `/api/v1/orders/${orderId}/status`,
      { status }
    );
    return { order: toProductionOrder(changed.order), message: changed.message };
  },

  async delete(orderId: string): Promise<void> {
    await apiClient.delete<void>(`/api/v1/orders/${orderId}`);
  },
};
