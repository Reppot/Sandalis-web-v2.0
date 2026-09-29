// view-модель фичи — то, что удобно показывать,
// а не то, как сервер назвал поля.
export type OrderStatus = "new" | "crafting" | "ready" | "done";

export interface Order {
  id: number;
  itemName: string;
  quantityKg: number;
  status: OrderStatus;
  statusLabel: string;   // «в производстве», «готов»… — уже по-русски
  deadlineLabel: string; // «12 авг., 18:00» — уже отформатировано
}

export interface NewOrder {
  itemId: number;
  quantity: number;
  comment?: string;
}
