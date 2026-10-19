import * as React from "react";
import type { Stockpile } from "@/entities/stockpile";
import { Modal, Input, Button, errorText } from "@/shared";
import type { CreateStockpileFormData } from "@/features/stockpiles/model/types";

interface CreateStockpileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateStockpileFormData) => Promise<void>;
  /** Передан — режим редактирования (PATCH), иначе создание. */
  editing?: Stockpile | null;
}

export const CreateStockpileModal: React.FC<CreateStockpileModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editing,
}) => {
  const [formData, setFormData] = React.useState<CreateStockpileFormData>({ name: "", region: "" });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    setFormData(editing ? { name: editing.name, region: editing.region } : { name: "", region: "" });
    setError(null);
  }, [isOpen, editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.region) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(formData);
      onClose();
    } catch (err) {
      setError(errorText(err, editing ? "Не удалось сохранить склад" : "Не удалось создать склад"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? "РЕДАКТИРОВАТЬ СКЛАД" : "ДОБАВИТЬ СКЛАД"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-xs text-red-400">{error}</p>}
        <Input
          label="Название склада"
          placeholder="Например: Kirknell Forward Base"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
        <Input
          label="Регион"
          placeholder="Например: The Moors"
          value={formData.region}
          onChange={(e) => setFormData({ ...formData, region: e.target.value })}
          required
        />
        <div className="flex justify-end gap-3 pt-4 border-t border-sindaris-border">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" isLoading={loading}>
            {editing ? "Сохранить" : "Создать склад"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
