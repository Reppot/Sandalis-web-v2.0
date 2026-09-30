import * as React from "react";
import { Modal, Input, Button } from "@/shared";
import type { TimerType } from "@/features/timers/model/types";

interface CreateTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, type: TimerType, hours: number) => Promise<void>;
}

export const CreateTimerModal: React.FC<CreateTimerModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<TimerType>("stockpile_decay");
  const [hours, setHours] = React.useState(48);
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setLoading(true);
    try {
      await onSubmit(name, type, hours);
      setName("");
      setHours(48);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ЗАПУСТИТЬ ТАЙМЕР">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Название таймера"
          placeholder="Например: Склад в Огоре"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <div className="space-y-1.5">
          <label className="block text-xs font-mono font-medium text-sindaris-muted">
            Тип таймера
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TimerType)}
            className="flex h-10 w-full rounded-md border border-sindaris-border bg-sindaris-bg px-3 py-2 text-sm text-sindaris-text font-mono focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sindaris-accent"
          >
            <option value="stockpile_decay">Сброс склада (48ч)</option>
            <option value="facility_craft">Производство завода</option>
            <option value="operation">Боевая операция</option>
          </select>
        </div>
        <Input
          label="Длительность (в часах)"
          type="number"
          min="1"
          value={hours}
          onChange={(e) => setHours(parseInt(e.target.value) || 1)}
          required
        />
        <div className="flex justify-end gap-3 pt-4 border-t border-sindaris-border">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" isLoading={loading}>
            Запустить
          </Button>
        </div>
      </form>
    </Modal>
  );
};