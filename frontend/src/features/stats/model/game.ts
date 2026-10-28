import * as React from "react";
import { apiClient } from "@/shared";

/** Лиги снабжения (по сумме очков) и титулы сезона (по месту в текущей войне). */
export const TIERS = ["iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master"] as const;
export type Tier = (typeof TIERS)[number];
export type SeasonTitle = "challenger" | "grandmaster";
export const PERIODS = ["week", "month", "season", "all"] as const;
export type Period = (typeof PERIODS)[number];
export const CATEGORIES = ["points", "crates", "reserves", "ontime", "operations"] as const;
export type Category = (typeof CATEGORIES)[number];
export const ROMAN = ["", "I", "II", "III", "IV"];

export interface League {
  tier: Tier;
  division: number | null;
  points: number;
  floor: number;
  next_at: number | null;
}
export interface Badge {
  tier: Tier;
  division: number | null;
  title: SeasonTitle | null;
}
export interface BoardRow {
  rank: number;
  user_id: string;
  name: string;
  value: number;
  league: League;
  title: SeasonTitle | null;
}
export interface Board {
  period: Period;
  category: Category;
  season: { war: number | null; since: string | null };
  rows: BoardRow[];
  me: BoardRow | null;
  participants: number;
}
export interface Profile {
  user_id: string;
  name: string;
  league: League;
  title: SeasonTitle | null;
  season_points: number;
  season_rank: number | null;
  breakdown: Record<"delivery" | "line_done" | "reserve" | "attend" | "order_done", number>;
  crates: number;
  units: number;
  reserves: number;
  operations: number;
  due_ok: number;
  due_total: number;
  weeks: { start: string; points: number }[];
  recent: { kind: string; points: number; title: string; at: string; crates: number; units: number; report_id: string | null }[];
}

export const gameApi = {
  board: (period: Period, category: Category, limit = 25) =>
    apiClient.get<Board>("/api/v1/clan/game", { params: { period, category, limit } }),
  badges: () => apiClient.get<Record<string, Badge>>("/api/v1/clan/game/badges"),
  profile: (userId: string) => apiClient.get<Profile>(`/api/v1/clan/game/members/${encodeURIComponent(userId)}`),
};

// значки лиг у ников: один запрос на всю страницу, обновление раз в 5 минут
const STALE_MS = 5 * 60 * 1000;
let badges: Record<string, Badge> = {};
let fetchedAt = 0;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load(): void {
  if (pending || Date.now() - fetchedAt < STALE_MS) return;
  pending = gameApi
    .badges()
    .then((b) => {
      badges = b;
    })
    .catch(() => {
      badges = {};       // нет права на статистику или сбой — просто без значков
    })
    .finally(() => {
      fetchedAt = Date.now();
      pending = null;
      listeners.forEach((fn) => fn());
    });
}

/** Значок лиги участника (или undefined, пока не загружено / нет очков). */
export function useBadge(userId: string | null | undefined): Badge | undefined {
  const [, rerender] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    listeners.add(rerender);
    load();
    return () => {
      listeners.delete(rerender);
    };
  }, []);
  return userId ? badges[userId] : undefined;
}
