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
  streak: number;
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
  streak: { current: number; best: number };
  achievements: Achievement[];
  goals: number;
  trophies: { war: number; place: number }[];
}
export interface Achievement {
  key: string;
  level: number;
  levels: number;
  value: number;
  target: number;
  earned_at: string | null;
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

export interface Squad {
  rank: number;
  role_id: string;
  name: string;
  color: number;
  members: number;
  active: number;
  points: number;
  per_active: number;
}
export interface HallEntry {
  war: number | null;
  since: string | null;
  until: string | null;
  top: { user_id: string; name: string; points: number; tier: Tier }[];
}
export interface Summary {
  enabled: boolean;
  season: { war: number | null; since: string | null };
  goal: { target: number; progress: number; done: boolean; week: string; contributors: [string, number][] } | null;
  squads: Squad[];
  hall: HallEntry[];
  names: Record<string, string>;
}
export const WEIGHT_KEYS = ["crate", "unit", "line_done", "reserve", "reserve_save", "attend", "order_done"] as const;
export interface GameSettings {
  enabled: boolean;
  weights: Record<string, number>;
  excluded_roles: string[];
  squads: string[];
  weekly_goal: number;
  league_roles: boolean;
}
export interface GameSettingsRead extends GameSettings {
  defaults: Record<string, number>;
  roles: { id: string; name: string; color: number }[];
  bot: boolean;
}

export const gameClanApi = {
  summary: () => apiClient.get<Summary>("/api/v1/clan/game/summary"),
  settings: () => apiClient.get<GameSettingsRead>("/api/v1/clan/game/settings"),
  save: (s: GameSettings) => apiClient.put<GameSettingsRead>("/api/v1/clan/game/settings", s),
};
