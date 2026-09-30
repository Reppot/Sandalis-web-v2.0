"use client";

import { useCallback, useEffect, useState } from "react";
import { createOrder, fetchOpenOrders } from "../api/orders.api";
import { toOrder } from "./orders-mapping";
import type { NewOrder, Order } from "./types";

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchOpenOrders()
      .then((dtos) => setOrders(dtos.map(toOrder)))
      .finally(() => setIsLoading(false));
  }, []);

  const create = useCallback(async (data: NewOrder) => {
    const dto = await createOrder(data);
    setOrders((prev) => [toOrder(dto), ...prev]);
  }, []);

  return { orders, isLoading, createOrder: create };
}
