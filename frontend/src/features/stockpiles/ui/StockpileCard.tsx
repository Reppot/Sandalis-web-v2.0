import * as React from "react";
import type { Stockpile } from "@/entities/stockpile";
import { Card, Button } from "@/shared";
import { Archive, MapPin, Eye, EyeOff } from "lucide-react";

interface StockpileCardProps {
  stockpile: Stockpile;
  onOpenDetails: (stockpile: Stockpile) => void;
}

export const StockpileCard: React.FC<StockpileCardProps> = ({ stockpile, onOpenDetails }) => {
  const [showCode, setShowCode] = React.useState(false);
  const totalCrates = stockpile.items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <Card hoverable className="space-y-4 flex flex-col justify-between">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-sindaris-accent shrink-0" />
            <h3 className="font-bold text-base text-sindaris-text truncate">{stockpile.name}</h3>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-sindaris-muted">
          <MapPin className="h-3.5 w-3.5" />
          <span>{stockpile.location}</span>
        </div>

        {stockpile.code && (
          <div className="flex items-center justify-between bg-sindaris-bg p-2 rounded-md border border-sindaris-border">
            <span className="text-xs text-sindaris-muted font-mono">Код склада:</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-yellow-400">
                {showCode ? stockpile.code : "••••••"}
              </span>
              <button
                onClick={() => setShowCode(!showCode)}
                className="text-sindaris-muted hover:text-sindaris-text cursor-pointer"
              >
                {showCode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}

        <div className="text-xs text-sindaris-muted">
          Всего позиций: <span className="font-mono text-sindaris-text">{stockpile.items.length}</span> | Ящиков:{" "}
          <span className="font-mono text-sindaris-text">{totalCrates}</span>
        </div>
      </div>

      <Button variant="secondary" size="sm" onClick={() => onOpenDetails(stockpile)} className="w-full">
        Управление запасами
      </Button>
    </Card>
  );
};