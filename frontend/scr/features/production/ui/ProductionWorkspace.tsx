import * as React from "react";
import { MpfCalculator } from "@/features/production/ui/MpfCalculator";

export const ProductionWorkspace: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-sindaris-border">
        <h2 className="text-xl font-bold text-sindaris-accent tracking-wide">КАЛЬКУЛЯТОРЫ ПРОИЗВОДСТВА</h2>
        <p className="text-xs text-sindaris-muted">Оптимизация очередей массового завода (MPF) и фабрик</p>
      </div>

      <MpfCalculator />
    </div>
  );
};