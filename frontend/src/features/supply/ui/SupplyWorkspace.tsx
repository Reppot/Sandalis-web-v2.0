"use client";

import * as React from "react";
import type { Stockpile } from "@/entities/stockpile";
import { OrderBuilder } from "@/features/supply/ui/OrderBuilder";
import { StorageMonitor } from "@/features/supply/ui/StorageMonitor";

interface SupplyWorkspaceProps {
  canWriteStockpiles: boolean;
  canWriteOrders: boolean;
  onReportSubmitted: () => void;
}

/** Вкладка «Заказы»: монитор закреплённого склада + конструктор заказа (как /orders старого сайта). */
export const SupplyWorkspace: React.FC<SupplyWorkspaceProps> = ({ canWriteStockpiles, canWriteOrders, onReportSubmitted }) => {
  const [showStockpile, setShowStockpile] = React.useState(true);
  const [showConstructor, setShowConstructor] = React.useState(true);
  const [pinned, setPinned] = React.useState<Stockpile | null>(null);
  const onPinned = React.useCallback((s: Stockpile | null) => setPinned(s), []);

  const stockpileFull = showStockpile && !showConstructor;
  const constructorFull = showConstructor && !showStockpile;

  return (
    <div className="tab-fade flex min-h-full flex-col gap-2.5 md:gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`sidebar-subitem w-auto ${showStockpile ? "is-visible" : "is-hidden"}`} onClick={() => setShowStockpile((v) => !v || !showConstructor)} aria-pressed={showStockpile}>
          {showStockpile && <span className="sidebar-subitem-marker mr-1">[•]</span>}├─ 📦 Содержимое закреплённого склада
        </button>
        <button type="button" className={`sidebar-subitem w-auto ${showConstructor ? "is-visible" : "is-hidden"}`} onClick={() => setShowConstructor((v) => !v || !showStockpile)} aria-pressed={showConstructor}>
          {showConstructor && <span className="sidebar-subitem-marker mr-1">[•]</span>}└─ 🛠️ Конструктор заказа
        </button>
      </div>
      <div className="grid gap-2.5 md:gap-3 lg:grid-cols-2">
        <div className={`${showStockpile ? "block" : "hidden"} min-w-0 ${stockpileFull ? "lg:col-span-2" : ""}`}>
          <StorageMonitor canWrite={canWriteStockpiles} isFullWidth={stockpileFull} onPinned={onPinned} />
        </div>
        <div className={`${showConstructor ? "block" : "hidden"} min-w-0 ${constructorFull ? "lg:col-span-2" : ""}`}>
          <OrderBuilder canWrite={canWriteOrders} isFullWidth={constructorFull} pinned={pinned} onSubmitted={onReportSubmitted} />
        </div>
      </div>
    </div>
  );
};
