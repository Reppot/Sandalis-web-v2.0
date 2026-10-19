import * as React from "react";
import type { FoxholeTimer } from "@/features/timers/model/types";
import { Card, Button, cn } from "@/shared";
import { getRemainingSeconds, formatTimeLeft, getUrgencyLevel } from "@/features/timers/lib/timeFormatters";
import { CheckCircle2, RotateCcw, Trash2, Undo2 } from "lucide-react";

interface TimerCardProps {
  timer: FoxholeTimer;
  stockpileName: string | null;
  canWrite: boolean;
  onReset: (timer: FoxholeTimer) => void;
  onToggleCompleted: (timer: FoxholeTimer) => void;
  onDelete: (timer: FoxholeTimer) => void;
}

function formatDuration(seconds: number): string {
  const hours = seconds / 3600;
  return Number.isInteger(hours) ? `${hours} ч` : `${hours.toFixed(1)} ч`;
}

export const TimerCard: React.FC<TimerCardProps> = ({
  timer,
  stockpileName,
  canWrite,
  onReset,
  onToggleCompleted,
  onDelete,
}) => {
  const [remaining, setRemaining] = React.useState(() => getRemainingSeconds(timer.targetTimestamp));
  const completed = timer.completedAt !== null;

  React.useEffect(() => {
    setRemaining(getRemainingSeconds(timer.targetTimestamp));
    if (completed) return;
    const interval = setInterval(() => {
      setRemaining(getRemainingSeconds(timer.targetTimestamp));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer.targetTimestamp, completed]);

  const urgency = completed ? "normal" : getUrgencyLevel(remaining);

  return (
    <Card
      className={cn("border transition-colors flex flex-col justify-between", {
        "border-sindaris-border": urgency === "normal",
        "border-yellow-500/50 bg-yellow-950/10": urgency === "warning",
        "border-red-500/60 bg-red-950/20 animate-pulse": urgency === "critical",
        "border-red-900 bg-red-950/40 opacity-75": urgency === "expired",
        "opacity-60": completed,
      })}
    >
      <div className="space-y-2">
        <div className="flex justify-between items-start">
          <span className="text-xs uppercase font-bold text-sindaris-muted tracking-wide">
            {timer.kind.replaceAll("_", " ")}
          </span>
          {canWrite && (
            <button
              onClick={() => onDelete(timer)}
              className="text-sindaris-muted hover:text-red-400 cursor-pointer"
              title="Удалить таймер"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        <h4 className="text-base font-bold text-sindaris-text truncate">{timer.title}</h4>
        {stockpileName && <p className="text-[11px] text-sindaris-muted font-mono truncate">Склад: {stockpileName}</p>}
        {timer.note && <p className="text-xs text-sindaris-muted line-clamp-2">{timer.note}</p>}

        <div className="text-3xl font-bold font-mono tracking-wider py-2">
          {completed ? (
            <span className="text-green-400 text-xl">ЗАВЕРШЁН</span>
          ) : (
            <span
              className={cn({
                "text-sindaris-text": urgency === "normal",
                "text-yellow-400": urgency === "warning",
                "text-red-400": urgency === "critical" || urgency === "expired",
              })}
            >
              {formatTimeLeft(remaining)}
            </span>
          )}
        </div>
      </div>

      {canWrite && (
        <div className="pt-3 border-t border-sindaris-border/60 flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => onReset(timer)} className="flex-1">
            <RotateCcw className="h-3.5 w-3.5 mr-2" /> Сбросить ({formatDuration(timer.durationSeconds)})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onToggleCompleted(timer)}
            title={completed ? "Вернуть в работу" : "Отметить завершённым"}
          >
            {completed ? <Undo2 className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}
    </Card>
  );
};
