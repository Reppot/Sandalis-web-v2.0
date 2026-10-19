"use client";

import * as React from "react";
import { stockpileApi, type Stockpile } from "@/entities/stockpile";
import { secondsLeft, severityOf } from "@/shared";
import { timersApi, type Timer } from "@/features/timers/api";

export type Connection = "online" | "offline" | "syncing";

/** Таймер с привязанным складом — «склад на мониторинге» старого терминала. */
export interface MonitoredTimer extends Timer {
  stockpile: Stockpile | null;
}

interface TerminalContextValue {
  timers: MonitoredTimer[];
  stockpiles: Stockpile[];
  loading: boolean;
  connection: Connection;
  lastSync: Date | null;
  refresh: () => Promise<void>;
  upsertTimer: (timer: Timer) => void;
  removeTimer: (id: string) => void;
}

const TerminalContext = React.createContext<TerminalContextValue | null>(null);
const ClockContext = React.createContext<number>(0);

const POLL_MS = 20_000;

/**
 * Живые данные шапки и бегущей строки: таймеры и склады клана, опрос каждые 20 с
 * и при возврате на вкладку (как TerminalProvider старого сайта) + часы раз в секунду.
 */
export const TerminalProvider: React.FC<React.PropsWithChildren<{ enabled: boolean }>> = ({ enabled, children }) => {
  const [timers, setTimers] = React.useState<Timer[]>([]);
  const [stockpiles, setStockpiles] = React.useState<Stockpile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [connection, setConnection] = React.useState<Connection>("syncing");
  const [lastSync, setLastSync] = React.useState<Date | null>(null);
  const [now, setNow] = React.useState(0);
  const inflight = React.useRef(false);

  const refresh = React.useCallback(async () => {
    if (!enabled || inflight.current) return;
    inflight.current = true;
    try {
      const [t, s] = await Promise.all([timersApi.list(), stockpileApi.list()]);
      setTimers(t);
      setStockpiles(s);
      setLastSync(new Date());
      setConnection("online");
    } catch {
      setConnection("offline");
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled) return;
    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, refresh]);

  React.useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const upsertTimer = React.useCallback((timer: Timer) => {
    setTimers((prev) => (prev.some((t) => t.id === timer.id) ? prev.map((t) => (t.id === timer.id ? timer : t)) : [...prev, timer]));
  }, []);
  const removeTimer = React.useCallback((id: string) => setTimers((prev) => prev.filter((t) => t.id !== id)), []);

  const value = React.useMemo<TerminalContextValue>(() => {
    const byId = new Map(stockpiles.map((s) => [s.id, s]));
    const monitored = timers
      .map((t) => ({ ...t, stockpile: t.stockpile_id ? byId.get(t.stockpile_id) ?? null : null }))
      .sort((a, b) => new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime());
    return { timers: monitored, stockpiles, loading, connection, lastSync, refresh, upsertTimer, removeTimer };
  }, [timers, stockpiles, loading, connection, lastSync, refresh, upsertTimer, removeTimer]);

  return (
    <TerminalContext.Provider value={value}>
      <ClockContext.Provider value={now}>{children}</ClockContext.Provider>
    </TerminalContext.Provider>
  );
};

export function useTerminal(): TerminalContextValue {
  const ctx = React.useContext(TerminalContext);
  if (!ctx) throw new Error("useTerminal must be used within TerminalProvider");
  return ctx;
}

/** Текущее время, обновляется раз в секунду (0 до гидрации — без рассинхрона SSR). */
export function useClock(): number {
  return React.useContext(ClockContext);
}

/** Активные (не завершённые) таймеры по степени риска. */
export function useRiskSummary() {
  const { timers } = useTerminal();
  const now = useClock();
  return React.useMemo(() => {
    let critical = 0;
    let warning = 0;
    let safe = 0;
    for (const t of timers) {
      if (t.completed_at) continue;
      const sev = severityOf(secondsLeft(t.ends_at, now || Date.now()));
      if (sev === "critical") critical++;
      else if (sev === "warning") warning++;
      else safe++;
    }
    return { critical, warning, safe };
  }, [timers, now]);
}

export function timerPlace(t: MonitoredTimer): { region: string | null; location: string } {
  return t.stockpile ? { region: t.stockpile.region, location: t.stockpile.name } : { region: null, location: t.title };
}
