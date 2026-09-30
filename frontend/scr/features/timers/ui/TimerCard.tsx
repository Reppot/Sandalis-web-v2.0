import * as React from "react";
import type { FoxholeTimer } from "@/features/timers/model/types";
import { Card, Button, cn } from "@/shared";
import { getRemainingSeconds, formatTimeLeft, getUrgencyLevel } from "@/features/timers/lib/timeFormatters";
import { RotateCcw, Trash2 } from "lucide-react";

interface TimerCardProps {
  timer: FoxholeTimer;
  onReset: (id: string) => void;
  onDelete: (id: string) => void;
}

export const TimerCard: React.FC<TimerCardProps> = ({ timer, onReset, onDelete }) => {
  const [remaining, setRemaining] = React.useState(() => getRemainingSeconds(timer.targetTimestamp));

  React.useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(getRemainingSeconds(timer.targetTimestamp));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer.targetTimestamp]);

  const urgency = getUrgencyLevel(remaining);

  return (
    <Card
      className={cn("border transition-colors flex flex-col justify-between", {
        "border-sindaris-border": urgency === "normal",
        "border-yellow-500/50 bg-yellow-950/10": urgency === "warning",
        "border-red-500/60 bg-red-950/20 animate-pulse": urgency === "critical",
        "border-red-900 bg-red-950/40 opacity-75": urgency === "expired",
      })}
    >
      <div className="space-y-2">
        <div className="flex justify-between items-start">
          <span className="text-xs uppercase font-bold text-sindaris-muted tracking-wide">
            {timer.type.replace("_", " ")}
          </span>
          <button
            onClick={() => onDelete(timer.id)}
            className="text-sindaris-muted hover:text-red-400 cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <h4 className="text-base font-bold text-sindaris-text truncate">{timer.name}</h4>

        <div className="text-3xl font-bold font-mono tracking-wider py-2">
          <span
            className={cn({
              "text-sindaris-text": urgency === "normal",
              "text-yellow-400": urgency === "warning",
              "text-red-400": urgency === "critical" || urgency === "expired",
            })}
          >
            {formatTimeLeft(remaining)}
          </span>
        </div>
      </div>

      <div className="pt-3 border-t border-sindaris-border/60">
        <Button size="sm" variant="secondary" onClick={() => onReset(timer.id)} className="w-full">
          <RotateCcw className="h-3.5 w-3.5 mr-2" /> Сбросить таймер (48 ч)
        </Button>
      </div>
    </Card>
  );
};