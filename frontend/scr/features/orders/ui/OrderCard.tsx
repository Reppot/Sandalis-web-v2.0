import * as React from "react";
import type { ProductionOrder } from "@/entities/order";
import { Card, Button } from "@/shared";
import { CheckCircle2, Clock, PlayCircle, XCircle } from "lucide-react";

interface OrderCardProps {
  order: ProductionOrder;
  onStatusChange: (id: string, status: ProductionOrder["status"]) => void;
  onClaim: (id: string) => void;
}

export const OrderCard: React.FC<OrderCardProps> = ({ order, onStatusChange, onClaim }) => {
  const totalQuantity = order.items.reduce((acc, item) => acc + item.quantity, 0);
  const completedQuantity = order.items.reduce((acc, item) => acc + item.completedQuantity, 0);
  const progressPercent = totalQuantity > 0 ? Math.round((completedQuantity / totalQuantity) * 100) : 0;

  const statusIcons = {
    pending: <Clock className="h-4 w-4 text-yellow-500" />,
    processing: <PlayCircle className="h-4 w-4 text-blue-400" />,
    completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    cancelled: <XCircle className="h-4 w-4 text-red-500" />,
  };

  return (
    <Card hoverable className="flex flex-col justify-between space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {statusIcons[order.status]}
            <span className="text-xs uppercase tracking-wider font-bold text-sindaris-muted">
              {order.status}
            </span>
          </div>
          <span className="text-xs text-sindaris-muted">
            {new Date(order.createdAt).toLocaleDateString("ru-RU")}
          </span>
        </div>

        <h4 className="text-base font-bold text-sindaris-text truncate">{order.destination}</h4>
        
        {order.notes && (
          <p className="text-xs text-sindaris-muted line-clamp-2 bg-sindaris-bg p-2 rounded-sm border border-sindaris-border/50">
            {order.notes}
          </p>
        )}

        <div className="space-y-1.5 pt-2">
          {order.items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-xs">
              <span className="text-sindaris-text font-mono">{item.itemId}</span>
              <span className="text-sindaris-muted font-mono">{item.completedQuantity} / {item.quantity} шт</span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="w-full bg-sindaris-bg rounded-full h-1.5 overflow-hidden mt-3">
          <div
            className="bg-sindaris-accent h-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-sindaris-border">
        {order.status === "pending" && (
          <Button size="sm" variant="secondary" className="w-full" onClick={() => onClaim(order.id)}>
            Взять в работу
          </Button>
        )}
        {order.status === "processing" && (
          <Button size="sm" variant="primary" className="w-full" onClick={() => onStatusChange(order.id, "completed")}>
            Завершить
          </Button>
        )}
        {order.status !== "completed" && order.status !== "cancelled" && (
          <Button size="sm" variant="danger" onClick={() => onStatusChange(order.id, "cancelled")}>
            Отмена
          </Button>
        )}
      </div>
    </Card>
  );
};