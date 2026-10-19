import * as React from "react";
import type { Stockpile, StockpileItem } from "@/entities/stockpile";
import { ItemCodeInput } from "@/entities/item";
import { Modal, Button, Input, errorText } from "@/shared";
import { Check, Trash2, Plus } from "lucide-react";

interface StockpileDetailModalProps {
  stockpile: Stockpile | null;
  isOpen: boolean;
  canWrite: boolean;
  onClose: () => void;
  onAddItem: (id: string, itemCode: string, quantity: number) => Promise<void>;
  onSetQuantity: (id: string, itemCode: string, quantity: number) => Promise<void>;
  onRemoveItem: (id: string, itemCode: string) => Promise<void>;
}

interface ItemRowProps {
  item: StockpileItem;
  canWrite: boolean;
  busy: boolean;
  onSave: (quantity: number) => void;
  onRemove: () => void;
}

const ItemRow: React.FC<ItemRowProps> = ({ item, canWrite, busy, onSave, onRemove }) => {
  const [qty, setQty] = React.useState(item.quantity);
  React.useEffect(() => setQty(item.quantity), [item.quantity]);
  const dirty = qty !== item.quantity;

  return (
    <div className="flex justify-between items-center gap-3 p-2 rounded-md bg-sindaris-bg border border-sindaris-border/50 text-xs">
      <span className="font-mono text-sindaris-text truncate">{item.itemCode}</span>
      {canWrite ? (
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-20 h-7 rounded-sm border border-sindaris-border bg-sindaris-panel px-2 font-mono text-sindaris-accent"
          />
          {dirty && (
            <button
              type="button"
              onClick={() => onSave(qty)}
              className="text-green-400 hover:text-green-300 cursor-pointer"
              disabled={busy}
              title="Сохранить количество"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            className="text-red-400 hover:text-red-300 cursor-pointer"
            disabled={busy}
            title="Убрать позицию"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <span className="font-mono font-bold text-sindaris-accent">{item.quantity} шт.</span>
      )}
    </div>
  );
};

export const StockpileDetailModal: React.FC<StockpileDetailModalProps> = ({
  stockpile,
  isOpen,
  canWrite,
  onClose,
  onAddItem,
  onSetQuantity,
  onRemoveItem,
}) => {
  const [newItemCode, setNewItemCode] = React.useState("");
  const [newItemQty, setNewItemQty] = React.useState(1);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!stockpile) return null;

  const run = async (action: () => Promise<void>, fallback: string) => {
    setSaving(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err, fallback));
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemCode.trim()) return;
    await run(async () => {
      await onAddItem(stockpile.id, newItemCode.trim(), newItemQty);
      setNewItemCode("");
      setNewItemQty(1);
    }, "Не удалось добавить позицию");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`СОДЕРЖИМОЕ СКЛАДА: ${stockpile.name}`}>
      <div className="space-y-4">
        {error && <p className="text-xs text-red-400">{error}</p>}
        {canWrite && (
          <form
            onSubmit={handleAddItem}
            className="flex gap-2 items-start bg-sindaris-bg p-3 rounded-md border border-sindaris-border"
          >
            <div className="flex-1">
              <ItemCodeInput value={newItemCode} onChange={setNewItemCode} />
            </div>
            <div className="w-24">
              <Input
                type="number"
                min="1"
                value={newItemQty}
                onChange={(e) => setNewItemQty(parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <Button type="submit" size="md" isLoading={saving} title="Добавить / установить количество">
              <Plus className="h-4 w-4" />
            </Button>
          </form>
        )}

        <div className="max-h-60 overflow-y-auto space-y-2">
          {stockpile.items.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              canWrite={canWrite}
              busy={saving}
              onSave={(qty) =>
                void run(() => onSetQuantity(stockpile.id, it.itemCode, qty), "Не удалось изменить количество")
              }
              onRemove={() =>
                void run(() => onRemoveItem(stockpile.id, it.itemCode), "Не удалось удалить позицию")
              }
            />
          ))}
          {stockpile.items.length === 0 && (
            <p className="text-center py-6 text-xs text-sindaris-muted">Склад пуст</p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-sindaris-border">
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </Modal>
  );
};
