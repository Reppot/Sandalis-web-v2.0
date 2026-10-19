import * as React from "react";
import { Modal, Input, Button, errorText } from "@/shared";
import { ItemCodeInput } from "@/entities/item";
import type { CreateOrderFormData } from "@/features/orders/model/types";

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateOrderFormData) => Promise<void>;
  currentUserId: string | null;
}

const emptyForm: CreateOrderFormData = {
  title: "",
  itemCode: "",
  quantity: 1,
  notes: "",
  assigneeId: "",
};

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  currentUserId,
}) => {
  const [formData, setFormData] = React.useState<CreateOrderFormData>(emptyForm);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.itemCode) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(formData);
      setFormData(emptyForm);
      onClose();
    } catch (err) {
      setError(errorText(err, "Не удалось создать заказ"));
    } finally {
      setLoading(false);
    }
  };

  const assignToMe = currentUserId !== null && formData.assigneeId === currentUserId;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="СОЗДАТЬ ЗАКАЗ НА ПРОИЗВОДСТВО">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-xs text-red-400">{error}</p>}
        <Input
          label="Название заявки"
          placeholder="Например: SS на Seaport Kirknell"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
        />
        <ItemCodeInput
          label="Предмет из каталога"
          value={formData.itemCode}
          onChange={(itemCode) => setFormData({ ...formData, itemCode })}
          required
        />
        <Input
          label="Количество"
          type="number"
          min="1"
          value={formData.quantity}
          onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value, 10) || 1 })}
          required
        />
        <Input
          label="Примечание (опционально)"
          placeholder="Срочно к штурму / резерв клана"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
        {currentUserId && (
          <label className="flex items-center gap-2 text-xs text-sindaris-muted cursor-pointer">
            <input
              type="checkbox"
              checked={assignToMe}
              onChange={(e) => setFormData({ ...formData, assigneeId: e.target.checked ? currentUserId : "" })}
            />
            Назначить исполнителем себя
          </label>
        )}

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
