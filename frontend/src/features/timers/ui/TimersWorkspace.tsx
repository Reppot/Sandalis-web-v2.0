"use client";

import * as React from "react";
import type { Stockpile } from "@/entities/stockpile";
import type { CreateTimerInput, FoxholeTimer, TimerState } from "@/features/timers/model/types";
import { Button, Spinner, errorText, useToast } from "@/shared";
import { timersApi } from "@/features/timers/api/timersApi";
import { TimerCard } from "@/features/timers/ui/TimerCard";
import { CreateTimerModal } from "@/features/timers/ui/CreateTimerModal";
import { Plus } from "lucide-react";

interface TimersWorkspaceProps {
  canWrite: boolean;
}

const stateOptions: { label: string; value: TimerState | "all" }[] = [
  { label: "Все", value: "all" },
  { label: "Активные", value: "active" },
  { label: "Истекшие", value: "expired" },
  { label: "Завершённые", value: "completed" },
];

export const TimersWorkspace: React.FC<TimersWorkspaceProps> = ({ canWrite }) => {
  const notify = useToast();
  const [timers, setTimers] = React.useState<FoxholeTimer[]>([]);
  const [stockpiles, setStockpiles] = React.useState<Stockpile[]>([]);
  const [state, setState] = React.useState<TimerState | "all">("all");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const loadTimers = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await timersApi.list(state === "all" ? undefined : state);
      setTimers(data);
      setError(null);
    } catch (err) {
      setTimers([]);
      setError(errorText(err, "Не удалось загрузить таймеры"));
    } finally {
      setLoading(false);
    }
  }, [state]);

  React.useEffect(() => {
    void loadTimers();
  }, [loadTimers]);

  React.useEffect(() => {
    // справочник для подписи и привязки; без него вкладка всё равно работает
    timersApi.stockpileOptions().then(setStockpiles).catch(() => setStockpiles([]));
  }, []);

  const stockpileNames = React.useMemo(
    () => new Map(stockpiles.map((s) => [s.id, s.name])),
    [stockpiles]
  );

  const replace = (updated: FoxholeTimer) =>
    setTimers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));

  const act = async (action: () => Promise<void>, fallback: string) => {
    try {
      await action();
    } catch (err) {
      notify(errorText(err, fallback), "error");
    }
  };

  const handleCreate = async (input: CreateTimerInput) => {
    const { timer, message } = await timersApi.create(input);
    setTimers((prev) => [timer, ...prev]);
    notify(message);
  };

  const handleReset = (timer: FoxholeTimer) =>
    act(async () => {
      const { timer: updated, message } = await timersApi.reset(timer);
      replace(updated);
      notify(message);
    }, "Не удалось сбросить таймер");

  const handleToggleCompleted = (timer: FoxholeTimer) =>
    act(async () => {
      const { timer: updated, message } = await timersApi.setCompleted(timer.id, timer.completedAt === null);
      replace(updated);
      notify(message);
    }, "Не удалось обновить таймер");

  const handleDelete = (timer: FoxholeTimer) => {
    if (!window.confirm(`Удалить таймер «${timer.title}»?`)) return;
    void act(async () => {
      await timersApi.delete(timer.id);
      setTimers((prev) => prev.filter((t) => t.id !== timer.id));
      notify("Таймер удалён");
    }, "Не удалось удалить таймер");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-sindaris-border">
        <div>
          <h2 className="text-xl font-bold text-sindaris-accent tracking-wide">ТАЙМЕРЫ СКЛАДОВ</h2>
          <p className="text-xs text-sindaris-muted">Контроль 48-часового сброса резервов клана</p>
        </div>
        {canWrite && (
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Новый таймер
          </Button>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto">
        {stateOptions.map((opt) => (
          <Button
            key={opt.value}
            size="sm"
            variant={state === opt.value ? "primary" : "secondary"}
            onClick={() => setState(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : timers.length === 0 ? (
        <div className="p-12 text-center rounded-lg border border-dashed border-sindaris-border text-sindaris-muted font-mono">
          {canWrite
            ? "Таймеров нет. Создайте таймер для отслеживания сброса складов."
            : "Таймеров нет. Запускать таймеры могут офицеры клана."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {timers.map((timer) => (
            <TimerCard
              key={timer.id}
              timer={timer}
              stockpileName={timer.stockpileId ? stockpileNames.get(timer.stockpileId) ?? null : null}
              canWrite={canWrite}
              onReset={(t) => void handleReset(t)}
              onToggleCompleted={(t) => void handleToggleCompleted(t)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <CreateTimerModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
        stockpiles={stockpiles}
      />
    </div>
  );
};
