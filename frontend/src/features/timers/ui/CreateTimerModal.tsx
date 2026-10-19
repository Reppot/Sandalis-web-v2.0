import * as React from "react";
import type { Stockpile } from "@/entities/stockpile";
import { Modal, Input, Button, errorText } from "@/shared";
import type { CreateTimerInput, TimerKind } from "@/features/timers/model/types";

interface CreateTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTimerInput) => Promise<void>;
  stockpiles: Stockpile[];
}

const selectClass =
  "flex h-10 w-full rounded-md border border-sindaris-border bg-sindaris-bg px-3 py-2 text-sm text-sindaris-text font-mono focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sindaris-accent";

export const CreateTimerModal: React.FC<CreateTimerModalProps> = ({ isOpen, onClose, onSubmit, stockpiles }) => {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<TimerKind>("stockpile_decay");
  const [hours, setHours] = React.useState(48);
  const [note, setNote] = React.useState("");
  const [stockpileId, setStockpileId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit({ title: name, kind, durationSeconds: Math.round(hours * 3600), note, stockpileId });
      setName("");
      setHours(48);
      setNote("");
      setStockpileId("");
      onClose();
    } catch (err) {
      setError(errorText(err, "Не удалось создать таймер"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="ЗАПУСТИТЬ ТАЙМЕР">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-xs text-red-400">{error}</p>}
        <Input
          label="Название таймера"
          placeholder="Например: Склад в Огоре"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <div className="space-y-1.5">
          <label className="block text-xs font-mono font-medium text-sindaris-muted">Тип таймера</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as TimerKind)} className={selectClass}>
            <option value="stockpile_decay">Сброс склада (48ч)</option>
            <option value="generic">Общий</option>
            <option value="operation">Боевая операция</option>
            <option value="custom">Свой</option>
          </select>
        </div>
        {stockpiles.length > 0 && (
          <div className="space-y-1.5">
            <label className="block text-xs font-mono font-medium text-sindaris-muted">
              Склад (опционально)
            </label>
            <select value={stockpileId} onChange={(e) => setStockpileId(e.target.value)} className={selectClass}>
              <option value="">— без привязки —</option>
              {stockpiles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.region}
                </option>
              ))}
            </select>
          </div>
        )}
        <Input
          label="Длительность (в часах)"
          type="number"
          min="0.1"
          step="0.1"
          value={hours}
          onChange={(e) => setHours(parseFloat(e.target.value) || 1)}
          required
        />
        <Input
          label="Заметка (опционально)"
          placeholder="Кто отвечает за обновление"
          value={note}
          onChange={(e) => setNote(e.target.value)}
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
