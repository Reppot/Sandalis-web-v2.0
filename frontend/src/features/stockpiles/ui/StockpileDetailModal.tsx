import * as React from "react";
import type { Stockpile, StockpileItem } from "@/entities/stockpile";
import { Modal, Button, Input } from "@/shared";
import { Trash2, Plus } from "lucide-react";

interface StockpileDetailModalProps {
  stockpile: Stockpile | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, items: StockpileItem[]) => Promise<void>;
}

export const StockpileDetailModal: React.FC<StockpileDetailModalProps> = ({
  stockpile,
  isOpen,
  onClose,
  onSave,
}) => {
  const [items, setItems] = React.useState<StockpileItem[]>([]);
  const [newItemId, setNewItemId] = React.useState("");
  const [newItemQty, setNewItemQty] = React.useState(1);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (stockpile) setItems(stockpile.items);
  }, [stockpile]);

  if (!stockpile) return null;

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemId) return;
    setItems([...items, { itemId: newItemId, quantity: newItemQty }]);
    setNewItemId("");
    setNewItemQty(1);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(stockpile.id, items);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`СОДЕРЖИМОЕ СКЛАДА: ${stockpile.name}`}>
      <div className="space-y-4">
        <form onSubmit={handleAddItem} className="flex gap-2 items-end bg-sindaris-bg p-3 rounded-md border border-sindaris-border">
          <div className="flex-1">
            <Input
              placeholder="Код предмета"
              value={newItemId}
              onChange={(e) => setNewItemId(e.target.value)}
            />
          </div>
          <div className="w-24">
            <Input
              type="number"
              min="1"
              value={newItemQty}
              onChange={(e) => setNewItemQty(parseInt(e.target.value) || 1)}
            />
          </div>
          <Button type="submit" size="md">
            <Plus className="h-4 w-4" />
          </Button>
        </form>

        <div className="max-h-60 overflow-y-auto space-y-2">
          {items.map((it, idx) => (
            <div
              key={idx}
              className="flex justify-between items-center p-2 rounded-md bg-sindaris-bg border border-sindaris-border/50 text-xs"
            >
              <span className="font-mono text-sindaris-text">{it.itemId}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-sindaris-accent">{it.quantity} ящ.</span>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(idx)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-center py-6 text-xs text-sindaris-muted">Склад пуст</p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-sindaris-border">
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
          <Button onClick={handleSave} isLoading={saving}>
            Сохранить изменения
          </Button>
        </div>
      </div>
    </Modal>
  );
};