import { api } from "@/shared/api/client";
import type { OrderDto } from "./dto";
import type { NewOrder } from "../model/types";

export function fetchOpenOrders(): Promise<OrderDto[]> {
  return api<OrderDto[]>("/api/v1/orders?status=open");
}

export function createOrder(data: NewOrder): Promise<OrderDto> {
  return api<OrderDto>("/api/v1/orders", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
