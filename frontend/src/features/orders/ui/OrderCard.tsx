import * as React from "react";
import type { OrderStatus, ProductionOrder } from "@/entities/order";
import { Card, Button } from "@/shared";
import { ORDER_TRANSITIONS } from "@/features/orders/model/types";
import { CheckCircle2, Clock, FileEdit, Pencil, PlayCircle, Trash2, UserCheck, XCircle } from "lucide-react";

interface OrderCardProps {
  order: ProductionOrder;
  currentUserId: string | null;
  canWrite: boolean;
  canDelete: boolean;
  onStatusChange: (id: string, status: OrderStatus) => void;
  onAssign: (id: string, assigneeId: string | null) => void;
  onEdit: (order: ProductionOrder) => void;
  onDelete: (order: ProductionOrder) => void;
}

const statusIcons: Record<OrderStatus, React.ReactNode> = {
  draft: <FileEdit className="h-4 w-4 text-sindaris-muted" />,
  queued: <Clock className="h-4 w-4 text-yellow-500" />,
  in_progress: <PlayCircle className="h-4 w-4 text-blue-400" />,
  done: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  cancelled: <XCircle className="h-4 w-4 text-red-500" />,
};

const statusLabels: Record<OrderStatus, string> = {
  draft: "черновик",
  queued: "в очереди",
  in_progress: "в работе",
  done: "готово",
  cancelled: "отменён",
};

const forwardLabels: Partial<Record<OrderStatus, string>> = {
  queued: "В очередь",
  in_progress: "Начать работу",
  done: "Завершить",
};

export const OrderCard: React.FC<OrderCardProps> = ({
  order,
  currentUserId,
  canWrite,
  canDelete,
  onStatusChange,
  onAssign,
  onEdit,
  onDelete,
}) => {
  const progressPercent =
    order.quantity > 0 ? Math.min(100, Math.round((order.produced / order.quantity) * 100)) : 0;
  const next = ORDER_TRANSITIONS[order.status];
  const forward = next.find((s) => s !== "cancelled");
  const isOpen = next.length > 0;
  const isMine = currentUserId !== null && order.assigneeId === currentUserId;

  return (
    <Card hoverable className="flex flex-col justify-between space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {statusIcons[order.status]}
            <span className="text-xs uppercase tracking-wider font-bold text-sindaris-muted">
              {statusLabels[order.status]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-sindaris-muted">
              {new Date(order.createdAt).toLocaleDateString("ru-RU")}
            </span>
            {canWrite && isOpen && (
              <button
                type="button"
                onClick={() => onEdit(order)}
                className="text-sindaris-muted hover:text-sindaris-text cursor-pointer"
                title="Редактировать"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(order)}
                className="text-sindaris-muted hover:text-red-400 cursor-pointer"
                title="Удалить"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <h4 className="text-base font-bold text-sindaris-text truncate">{order.title}</h4>

        {order.notes && (
          <p className="text-xs text-sindaris-muted line-clamp-2 bg-sindaris-bg p-2 rounded-sm border border-sindaris-border/50">
            {order.notes}
          </p>
        )}

        <div className="flex justify-between text-xs pt-2">
          <span className="text-sindaris-text font-mono">{order.itemCode}</span>
          <span className="text-sindaris-muted font-mono">
            {order.produced} / {order.quantity} шт
          </span>
        </div>

        <div className="w-full bg-sindaris-bg rounded-full h-1.5 overflow-hidden mt-3">
          <div
            className="bg-sindaris-accent h-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <p className="text-[11px] text-sindaris-muted font-mono truncate">
          Исполнитель: {order.assigneeId ? (isMine ? "вы" : order.assigneeId) : "—"}
        </p>
      </div>

      {canWrite && isOpen && (
        <div className="flex items-center gap-2 pt-2 border-t border-sindaris-border">
          {forward && (
            <Button
              size="sm"
              variant={forward === "done" ? "primary" : "secondary"}
              className="flex-1"
              onClick={() => onStatusChange(order.id, forward)}
            >
              {forwardLabels[forward]}
            </Button>
          )}
          {currentUserId && (
            <Button
              size="sm"
              variant="ghost"
              title={isMine ? "Снять с себя" : "Взять себе"}
              onClick={() => onAssign(order.id, isMine ? null : currentUserId)}
            >
              <UserCheck className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={() => onStatusChange(order.id, "cancelled")}>
            Отмена
          </Button>
        </div>
      )}
    </Card>
  );
};
