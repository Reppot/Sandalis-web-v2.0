"use client";

import * as React from "react";
import type { Stockpile } from "@/entities/stockpile";
import { Button, Spinner, errorText, useToast } from "@/shared";
import { stockpilesApi } from "@/features/stockpiles/api/stockpilesApi";
import type { CreateStockpileFormData } from "@/features/stockpiles/model/types";
import { StockpileCard } from "@/features/stockpiles/ui/StockpileCard";
import { StockpileDetailModal } from "@/features/stockpiles/ui/StockpileDetailModal";
import { CreateStockpileModal } from "@/features/stockpiles/ui/CreateStockpileModal";
import { Plus } from "lucide-react";

interface StockpilesWorkspaceProps {
  canWrite: boolean;
}

export const StockpilesWorkspace: React.FC<StockpilesWorkspaceProps> = ({ canWrite }) => {
  const notify = useToast();
  const [stockpiles, setStockpiles] = React.useState<Stockpile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedStockpile, setSelectedStockpile] = React.useState<Stockpile | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Stockpile | null>(null);

  const loadStockpiles = React.useCallback(async () => {
    try {
      const data = await stockpilesApi.list();
      setStockpiles(data);
      setError(null);
    } catch (err) {
      setStockpiles([]);
      setError(errorText(err, "Не удалось загрузить склады"));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadStockpiles();
  }, [loadStockpiles]);

  const replace = (next: Stockpile) =>
    setStockpiles((prev) => prev.map((s) => (s.id === next.id ? { ...next, items: s.items } : s)));

  const handleSubmitForm = async (data: CreateStockpileFormData) => {
    if (editing) {
      const { stockpile, message } = await stockpilesApi.update(editing.id, data);
      // PATCH отдаёт склад без агрегатов — сохраняем счётчики из списка
      replace({ ...stockpile, itemsCount: editing.itemsCount, totalQuantity: editing.totalQuantity });
      notify(message);
    } else {
      const { stockpile, message } = await stockpilesApi.create(data);
      setStockpiles((prev) => [stockpile, ...prev]);
      notify(message);
    }
  };

  const openDetails = async (stockpile: Stockpile) => {
    try {
      setSelectedStockpile(await stockpilesApi.get(stockpile.id));
    } catch (err) {
      notify(errorText(err, "Не удалось открыть склад"), "error");
    }
  };

  const refreshDetail = async (id: string, message?: string) => {
    const detail = await stockpilesApi.get(id);
    setSelectedStockpile(detail);
    setStockpiles((prev) => prev.map((s) => (s.id === detail.id ? detail : s)));
    if (message) notify(message);
  };

  const handleAddItem = async (id: string, itemCode: string, quantity: number) => {
    await refreshDetail(id, await stockpilesApi.upsertItem(id, itemCode, quantity));
  };

  const handleSetQuantity = async (id: string, itemCode: string, quantity: number) => {
    await refreshDetail(id, await stockpilesApi.setItemQuantity(id, itemCode, quantity));
  };

  const handleRemoveItem = async (id: string, itemCode: string) => {
    await stockpilesApi.deleteItem(id, itemCode);
    await refreshDetail(id, "Позиция удалена");
  };

  const handleDelete = async (stockpile: Stockpile) => {
    if (!window.confirm(`Удалить склад «${stockpile.name}» со всеми позициями?`)) return;
    try {
      await stockpilesApi.delete(stockpile.id);
      setStockpiles((prev) => prev.filter((s) => s.id !== stockpile.id));
      notify("Склад удалён");
    } catch (err) {
      notify(errorText(err, "Не удалось удалить склад"), "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-sindaris-border">
        <div>
          <h2 className="text-xl font-bold text-sindaris-accent tracking-wide">СКЛАДЫ И РЕЗЕРВЫ</h2>
          <p className="text-xs text-sindaris-muted">Учёт кланового имущества</p>
        </div>
        {canWrite && (
          <Button
            onClick={() => {
              setEditing(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Добавить склад
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : stockpiles.length === 0 ? (
        <div className="p-12 text-center rounded-lg border border-dashed border-sindaris-border text-sindaris-muted font-mono">
          {canWrite ? "Склады пока не зарегистрированы. Нажмите «Добавить склад»." : "Склады пока не зарегистрированы."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stockpiles.map((stockpile) => (
            <StockpileCard
              key={stockpile.id}
              stockpile={stockpile}
              canWrite={canWrite}
              onOpenDetails={(s) => void openDetails(s)}
              onEdit={(s) => {
                setEditing(s);
                setIsFormOpen(true);
              }}
              onDelete={(s) => void handleDelete(s)}
            />
          ))}
        </div>
      )}

      <StockpileDetailModal
        stockpile={selectedStockpile}
        isOpen={Boolean(selectedStockpile)}
        canWrite={canWrite}
        onClose={() => setSelectedStockpile(null)}
        onAddItem={handleAddItem}
        onSetQuantity={handleSetQuantity}
        onRemoveItem={handleRemoveItem}
      />

      <CreateStockpileModal
        isOpen={isFormOpen}
        editing={editing}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleSubmitForm}
      />
    </div>
  );
};
