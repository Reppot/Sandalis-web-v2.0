export type TimerType = "stockpile_decay" | "facility_craft" | "operation";

export interface FoxholeTimer {
  id: string;
  name: string;
  type: TimerType;
  targetTimestamp: number; // Unix ms
  durationSeconds: number;
}

export type UrgencyLevel = "normal" | "warning" | "critical" | "expired";