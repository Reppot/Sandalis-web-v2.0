import type { OrderDto } from "../api/dto";
import type { Order, OrderStatus } from "./types";

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "новый",
  crafting: "в производстве",
  ready: "готов",
  done: "выдан",
};

export function toOrder(dto: OrderDto): Order {
  return {
    id: dto.id,
    itemName: dto.item_name,
    quantityKg: dto.quantity_kg,
    status: dto.status,
    statusLabel: STATUS_LABELS[dto.status],
    deadlineLabel: new Date(dto.deadline).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}
