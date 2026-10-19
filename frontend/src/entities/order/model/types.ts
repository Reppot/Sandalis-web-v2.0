export type OrderStatus = "draft" | "queued" | "in_progress" | "done" | "cancelled";

export interface ProductionOrder {
  id: string;
  title: string;
  status: OrderStatus;
  itemCode: string;
  quantity: number;
  produced: number;
  notes: string | null;
  createdBy: string;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderReadDto {
  id: string;
  title: string;
  status: OrderStatus;
  item_code: string;
  quantity: number;
  produced: number;
  notes: string | null;
  created_by: string;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
}

export function toProductionOrder(dto: OrderReadDto): ProductionOrder {
  return {
    id: dto.id,
    title: dto.title,
    status: dto.status,
    itemCode: dto.item_code,
    quantity: dto.quantity,
    produced: dto.produced,
    notes: dto.notes,
    createdBy: dto.created_by,
    assigneeId: dto.assignee_id,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}
