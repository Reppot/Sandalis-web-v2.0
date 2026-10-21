"use client";

import * as React from "react";
import type { Stockpile } from "@/entities/stockpile";
import { Scopes, type Can } from "@/entities/session";
import { PaneToggles, usePanes, useT } from "@/shared";
import { OrderBuilder } from "@/features/supply/ui/OrderBuilder";
import { StorageMonitor } from "@/features/supply/ui/StorageMonitor";

interface SupplyWorkspaceProps {
  can: Can;
  onReportSubmitted: () => void;
}

/** Вкладка «Заказы»: монитор закреплённого склада + конструктор заказа (как /orders старого сайта). */
export const SupplyWorkspace: React.FC<SupplyWorkspaceProps> = ({ can, onReportSubmitted }) => {
  const t = useT();
  // те же крупные тумблеры окон, что и в калькуляторах
  const panes = usePanes();
  const showStockpile = panes.first;
  const showConstructor = panes.second;
  const [pinned, setPinned] = React.useState<Stockpile | null>(null);
  const onPinned = React.useCallback((s: Stockpile | null) => setPinned(s), []);

  const stockpileFull = showStockpile && !showConstructor;
  const constructorFull = showConstructor && !showStockpile;

  return (
    <div className="tab-fade flex min-h-full flex-col gap-2.5 md:gap-3">
      <PaneToggles panes={panes} first={{ label: t("stock.title"), icon: "📦" }} second={{ label: t("builder.title"), icon: "🛠️" }} guide="supply-panes" />
      <div className="grid gap-2.5 md:gap-3 lg:grid-cols-2">
        <div className={`${showStockpile ? "block" : "hidden"} min-w-0 ${stockpileFull ? "lg:col-span-2" : ""}`}>
          <StorageMonitor can={can} isFullWidth={stockpileFull} onPinned={onPinned} />
        </div>
        <div className={`${showConstructor ? "block" : "hidden"} min-w-0 ${constructorFull ? "lg:col-span-2" : ""}`}>
          <OrderBuilder canWrite={can(Scopes.REPORTS_CREATE)} isFullWidth={constructorFull} pinned={pinned} onSubmitted={onReportSubmitted} />
        </div>
      </div>
    </div>
  );
};
