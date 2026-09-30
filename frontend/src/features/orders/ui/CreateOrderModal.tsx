import * as React from "react";
import { Modal, Input, Button } from "@/shared";
import type { CreateOrderFormData } from "@/features/orders/model/types";

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateOrderFormData) => Promise<void>;
}

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [formData, setFormData] = React.useState<CreateOrderFormData>({
    itemId: "",
    quantity: 1,
    destination: "",
    notes: "",
  });
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.itemId || !formData.destination) return;
    setLoading(true);
    try {
      await onSubmit(formData);
      setFormData({ itemId: "", quantity: 1, destination: "", notes: "" });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="СОЗДАТЬ ЗАКАЗ НА ПРОИЗВОДСТВО">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Код или название предмета"
          placeholder="Например: Soldier Supplies (SS)"
          value={formData.itemId}
          onChange={(e) => setFormData({ ...formData, itemId: e.target.value })}
          required
        />
        <Input
          label="Количество (ящиков / штук)"
          type="number"
          min="1"
          value={formData.quantity}
          onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
          required
        />
        <Input
          label="Место доставки / Склад"
          placeholder="Например: Seaport - Kirknell"
          value={formData.destination}
          onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
          required
        />
        <Input
          label="Примечание (опционально)"
          placeholder="Срочно к штурму / резерв клана"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />

        <div className="flex justify-end gap-3 pt-4 border-t border-sindaris-border">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" isLoading={loading}>
            Создать заказ
          </Button>
        </div>
      </form>
    </Modal>
  );
};