import { apiClient } from "@/shared";
import type { ProductionOrder, OrderStatus } from "@/entities/order";
import type { CreateOrderFormData } from "@/features/orders/model/types";

export const ordersApi = {
  async list(): Promise<ProductionOrder[]> {
    return apiClient.get<ProductionOrder[]>("/api/v1/orders");
  },

  async create(data: CreateOrderFormData): Promise<ProductionOrder> {
    return apiClient.post<ProductionOrder>("/api/v1/orders", {
      destination: data.destination,
      notes: data.notes || null,
      items: [{ itemId: data.itemId, quantity: data.quantity, completedQuantity: 0 }],
    });
  },

  async updateStatus(orderId: string, status: OrderStatus): Promise<ProductionOrder> {
    return apiClient.patch<ProductionOrder>(`/api/v1/orders/${orderId}/status`, { status });
  },

  async claim(orderId: string): Promise<ProductionOrder> {
    return apiClient.post<ProductionOrder>(`/api/v1/orders/${orderId}/claim`);
  },

  async delete(orderId: string): Promise<void> {
    return apiClient.delete<void>(`/api/v1/orders/${orderId}`);
  },
};