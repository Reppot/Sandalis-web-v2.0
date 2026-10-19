import * as React from "react";
import type { ProductionOrder } from "@/entities/order";
import { Modal, Input, Button, errorText } from "@/shared";
import type { OrderPatch } from "@/features/orders/model/types";

interface EditOrderModalProps {
  order: ProductionOrder | null;
  onClose: () => void;
  onSubmit: (id: string, patch: OrderPatch) => Promise<void>;
}

export const EditOrderModal: React.FC<EditOrderModalProps> = ({ order, onClose, onSubmit }) => {
  const [title, setTitle] = React.useState("");
  const [quantity, setQuantity] = React.useState(1);
  const [produced, setProduced] = React.useState(0);
  const [notes, setNotes] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!order) return;
    setTitle(order.title);
    setQuantity(order.quantity);
    setProduced(order.produced);
    setNotes(order.notes ?? "");
    setError(null);
  }, [order]);

  if (!order) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit(order.id, { title, quantity, produced, notes: notes.trim() || null });
      onClose();
    } catch (err) {
      setError(errorText(err, "Не удалось сохранить заказ"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`ЗАКАЗ: ${order.itemCode}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-xs text-red-400">{error}</p>}
        <Input label="Название заявки" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Нужно, шт"
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
            required
          />
          <Input
            label="Произведено, шт"
            type="number"
            min="0"
            value={produced}
            onChange={(e) => setProduced(Math.max(0, parseInt(e.target.value, 10) || 0))}
          />
        </div>
        <Input label="Примечание" value={notes} onChange={(e) => setNotes(e.target.value)} />

        <div className="flex justify-end gap-3 pt-4 border-t border-sindaris-border">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" isLoading={loading}>
            Сохранить
          </Button>
        </div>
      </form>
    </Modal>
  );
};
