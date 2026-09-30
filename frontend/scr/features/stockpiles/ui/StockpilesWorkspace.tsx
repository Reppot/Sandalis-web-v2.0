"use client";

import * as React from "react";
import type { Stockpile, StockpileItem } from "@/entities/stockpile";
import { Button, Spinner } from "@/shared";
import { stockpilesApi } from "@/features/stockpiles/api/stockpilesApi";
import type { CreateStockpileFormData } from "@/features/stockpiles/model/types";
import { StockpileCard } from "@/features/stockpiles/ui/StockpileCard";
import { StockpileDetailModal } from "@/features/stockpiles/ui/StockpileDetailModal";
import { CreateStockpileModal } from "@/features/stockpiles/ui/CreateStockpileModal";
import { Plus } from "lucide-react";

export const StockpilesWorkspace: React.FC = () => {
  const [stockpiles, setStockpiles] = React.useState<Stockpile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedStockpile, setSelectedStockpile] = React.useState<Stockpile | null>(null);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const loadStockpiles = React.useCallback(async () => {
    try {
      const data = await stockpilesApi.list();
      setStockpiles(data);
    } catch {
      setStockpiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadStockpiles();
  }, [loadStockpiles]);

  const handleCreate = async (data: CreateStockpileFormData) => {
    const created = await stockpilesApi.create(data);
    setStockpiles((prev) => [created, ...prev]);
  };

  const handleSaveItems = async (id: string, items: StockpileItem[]) => {
    const updated = await stockpilesApi.updateItems(id, items);
    setStockpiles((prev) => prev.map((s) => (s.id === id ? updated : s)));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-sindaris-border">
        <div>
          <h2 className="text-xl font-bold text-sindaris-accent tracking-wide">СКЛАДЫ И РЕЗЕРВЫ</h2>
          <p className="text-xs text-sindaris-muted">Учёт кланового имущества и секретных кодов</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Добавить склад
        </Button>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : stockpiles.length === 0 ? (
        <div className="p-12 text-center rounded-lg border border-dashed border-sindaris-border text-sindaris-muted font-mono">
          Склады пока не зарегистрированы. Нажмите «Добавить склад».
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stockpiles.map((stockpile) => (
            <StockpileCard
              key={stockpile.id}
              stockpile={stockpile}
              onOpenDetails={(s) => setSelectedStockpile(s)}
            />
          ))}
        </div>
      )}

      <StockpileDetailModal
        stockpile={selectedStockpile}
        isOpen={Boolean(selectedStockpile)}
        onClose={() => setSelectedStockpile(null)}
        onSave={handleSaveItems}
      />

      <CreateStockpileModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
};