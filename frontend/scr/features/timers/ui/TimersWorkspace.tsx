"use client";

import * as React from "react";
import type { FoxholeTimer, TimerType } from "@/features/timers/model/types";
import { Button, Spinner } from "@/shared";
import { timersApi } from "@/features/timers/api/timersApi";
import { TimerCard } from "@/features/timers/ui/TimerCard";
import { CreateTimerModal } from "@/features/timers/ui/CreateTimerModal";
import { Plus } from "lucide-react";

export const TimersWorkspace: React.FC = () => {
  const [timers, setTimers] = React.useState<FoxholeTimer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const loadTimers = React.useCallback(async () => {
    try {
      const data = await timersApi.list();
      setTimers(data);
    } catch {
      setTimers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadTimers();
  }, [loadTimers]);

  const handleCreate = async (name: string, type: TimerType, hours: number) => {
    const created = await timersApi.create(name, type, hours * 3600);
    setTimers((prev) => [created, ...prev]);
  };

  const handleReset = async (id: string) => {
    const updated = await timersApi.reset(id);
    setTimers((prev) => prev.map((t) => (t.id === id ? updated : t)));
  };

  const handleDelete = async (id: string) => {
    await timersApi.delete(id);
    setTimers((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-sindaris-border">
        <div>
          <h2 className="text-xl font-bold text-sindaris-accent tracking-wide">ТАЙМЕРЫ СКЛАДОВ</h2>
          <p className="text-xs text-sindaris-muted">Контроль 48-часовой сброса резервов клана</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Новый таймер
        </Button>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : timers.length === 0 ? (
        <div className="p-12 text-center rounded-lg border border-dashed border-sindaris-border text-sindaris-muted font-mono">
          Активных таймеров нет. Создайте таймер для отслеживания сброса складов.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {timers.map((timer) => (
            <TimerCard
              key={timer.id}
              timer={timer}
              onReset={handleReset}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <CreateTimerModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
};