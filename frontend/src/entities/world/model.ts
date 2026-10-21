"use client";

import * as React from "react";
import { apiClient } from "@/shared";

/** Город региона (Foxhole War API): владелец, город победы, постройки. */
export interface Town {
  name: string;
  /** Крупный город (Major) или малая отметка на карте (Minor). */
  major: boolean;
  /** Координаты в долях карты региона 0..1. */
  x: number;
  y: number;
  owner: "colonials" | "wardens" | "neutral" | null;
  victory: boolean;
  scorched: boolean;
  /** storage | seaport | refinery | factory | mpf | hospital | garage | shipyard | ... */
  facilities: string[];
}

export interface Region {
  key: string;
  name: string;
  towns: Town[];
  colonials: number;
  wardens: number;
  victory: number;
}

export interface World {
  war: {
    number: number | null;
    winner: string | null;
    required_victory_towns: number | null;
    started_at: number | null;
    victory_towns: Record<string, number>;
  };
  regions: Region[];
  source: string;
}

/** Постройки, ради которых сюда приезжает логист: депо и порт — места складов. */
export const STOCKPILE_FACILITIES = ["storage", "seaport"] as const;

export const worldApi = {
  regions(): Promise<World> {
    return apiClient.get<World>("/api/v1/world/regions");
  },
};

// один запрос на вкладку браузера: справочник нужен и инструменту, и формам складов/таймеров
let cached: { at: number; promise: Promise<World> } | null = null;
const TTL_MS = 60_000;

function load(force = false): Promise<World> {
  if (!cached || force || Date.now() - cached.at > TTL_MS) {
    const promise = worldApi.regions();
    cached = { at: Date.now(), promise };
    promise.catch(() => {
      if (cached?.promise === promise) cached = null;
    });
  }
  return cached.promise;
}

/** Регионы текущей войны. error — War API недоступен (формы тогда работают со старым списком). */
export function useWorld(): { world: World | null; error: unknown; reload: () => void } {
  const [world, setWorld] = React.useState<World | null>(null);
  const [error, setError] = React.useState<unknown>(null);
  const fetchWorld = React.useCallback((force: boolean) => {
    load(force).then((w) => {
      setWorld(w);
      setError(null);
    }, setError);
  }, []);
  React.useEffect(() => fetchWorld(false), [fetchWorld]);
  return { world, error, reload: () => fetchWorld(true) };
}

/** Города региона для подсказок: сначала с депо/портом, потом крупные, потом остальные. */
export function townsForStockpile(region: Region | undefined): Town[] {
  if (!region) return [];
  const rank = (t: Town) => (t.facilities.some((f) => (STOCKPILE_FACILITIES as readonly string[]).includes(f)) ? 0 : t.major ? 1 : 2);
  return [...region.towns].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function findRegion(world: World | null, name: string): Region | undefined {
  const needle = name.trim().toLowerCase();
  return needle ? world?.regions.find((r) => r.name.toLowerCase() === needle) : undefined;
}
