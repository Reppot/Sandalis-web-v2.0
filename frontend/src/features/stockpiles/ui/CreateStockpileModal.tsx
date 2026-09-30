import * as React from "react";
import { Modal, Input, Button } from "@/shared";
import type { CreateStockpileFormData } from "@/features/stockpiles/model/types";

interface CreateStockpileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateStockpileFormData) => Promise<void>;
}

export const CreateStockpileModal: React.FC<CreateStockpileModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [formData, setFormData] = React.useState<CreateStockpileFormData>({
    name: "",
    location: "",
    code: "",
  });
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.location) return;
    setLoading(true);
    try {
      await onSubmit(formData);
      setFormData({ name: "", location: "", code: "" });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ДОБАВИТЬ СКЛАД">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Название склада"
          placeholder="Например: Kirknell Forward Base"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
        <Input
          label="Локация / Регион"
          placeholder="Например: The Moors"
          value={formData.location}
          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          required
        />
        <Input
          label="Код доступа (для резервных складов)"
          placeholder="6 цифр"
          value={formData.code}
          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
        />
        <div className="flex justify-end gap-3 pt-4 border-t border-sindaris-border">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" isLoading={loading}>
            Создать склад
          </Button>
        </div>
      </form>
    </Modal>
  );
};