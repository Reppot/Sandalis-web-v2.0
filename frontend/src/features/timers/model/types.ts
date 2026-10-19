export type TimerKind = "stockpile_decay" | "generic" | "operation" | "custom";

/** Фильтр `state` в GET /api/v1/timers. */
export type TimerState = "active" | "expired" | "completed";

export interface CreateTimerInput {
  title: string;
  kind: TimerKind;
  durationSeconds: number;
  note: string;
  stockpileId: string;
}

export interface FoxholeTimer {
  id: string;
  title: string;
  kind: string;
  note: string | null;
  stockpileId: string | null;
  startsAt: string;
  endsAt: string;
  durationSeconds: number;
  completedAt: string | null;
  createdBy: string;
  remainingSeconds: number;
  remainingDisplay: string;
  urgency: string;
  expired: boolean;
  targetTimestamp: number;
}

export interface TimerReadDto {
  id: string;
  title: string;
  kind: string;
  note: string | null;
  stockpile_id: string | null;
  starts_at: string;
  ends_at: string;
  duration_seconds: number;
  completed_at: string | null;
  created_by: string;
  remaining_seconds: number;
  remaining_display: string;
  urgency: string;
  expired: boolean;
  target_timestamp: number;
}

export type UrgencyLevel = "normal" | "warning" | "critical" | "expired";

export function toFoxholeTimer(dto: TimerReadDto): FoxholeTimer {
  return {
    id: dto.id,
    title: dto.title,
    kind: dto.kind,
    note: dto.note,
    stockpileId: dto.stockpile_id,
    startsAt: dto.starts_at,
    endsAt: dto.ends_at,
    durationSeconds: dto.duration_seconds,
    completedAt: dto.completed_at,
    createdBy: dto.created_by,
    remainingSeconds: dto.remaining_seconds,
    remainingDisplay: dto.remaining_display,
    urgency: dto.urgency,
    expired: dto.expired,
    targetTimestamp: dto.target_timestamp,
  };
}
