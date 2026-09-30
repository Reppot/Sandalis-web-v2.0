import type { UrgencyLevel } from "@/features/timers/model/types";

export function getRemainingSeconds(targetTimestamp: number): number {
  const diff = targetTimestamp - Date.now();
  return Math.max(0, Math.floor(diff / 1000));
}

export function formatTimeLeft(totalSeconds: number): string {
  if (totalSeconds <= 0) return "ИСТЕК";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getUrgencyLevel(remainingSeconds: number): UrgencyLevel {
  if (remainingSeconds <= 0) return "expired";
  if (remainingSeconds < 4 * 3600) return "critical"; // < 4 часов
  if (remainingSeconds < 12 * 3600) return "warning"; // < 12 часов
  return "normal";
}