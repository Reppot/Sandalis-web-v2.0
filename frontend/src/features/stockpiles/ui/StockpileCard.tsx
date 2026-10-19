import * as React from "react";
import type { Stockpile } from "@/entities/stockpile";
import { Card, Button } from "@/shared";
import { Archive, MapPin, Pencil, Trash2 } from "lucide-react";

interface StockpileCardProps {
  stockpile: Stockpile;
  canWrite: boolean;
  onOpenDetails: (stockpile: Stockpile) => void;
  onEdit: (stockpile: Stockpile) => void;
  onDelete: (stockpile: Stockpile) => void;
}

export const StockpileCard: React.FC<StockpileCardProps> = ({
  stockpile,
  canWrite,
  onOpenDetails,
  onEdit,
  onDelete,
}) => {
  return (
    <Card hoverable className="space-y-4 flex flex-col justify-between">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Archive className="h-5 w-5 text-sindaris-accent shrink-0" />
            <h3 className="font-bold text-base text-sindaris-text truncate">{stockpile.name}</h3>
          </div>
          {canWrite && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onEdit(stockpile)}
                className="text-sindaris-muted hover:text-sindaris-text cursor-pointer"
                title="Переименовать"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(stockpile)}
                className="text-sindaris-muted hover:text-red-400 cursor-pointer"
                title="Удалить склад"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-sindaris-muted">
          <MapPin className="h-3.5 w-3.5" />
          <span>{stockpile.region}</span>
        </div>

        <div className="text-xs text-sindaris-muted">
          Позиций: <span className="font-mono text-sindaris-text">{stockpile.itemsCount}</span> | Кол-во:{" "}
          <span className="font-mono text-sindaris-text">{stockpile.totalQuantity}</span>
        </div>
      </div>

      <Button variant="secondary" size="sm" onClick={() => onOpenDetails(stockpile)} className="w-full">
        {canWrite ? "Управление запасами" : "Содержимое"}
      </Button>
    </Card>
  );
};
