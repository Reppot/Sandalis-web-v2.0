"use client";

import * as React from "react";
import { useT, type MessageKey } from "@/shared/i18n";

export type Tone = "info" | "success" | "warning" | "danger";

interface Notice {
  id: number;
  title: string;
  message: string;
  tone: Tone;
}

export interface NotifyInput {
  title: string;
  message: string;
  tone?: Tone;
  ttl?: number;
}

type Notify = (input: NotifyInput) => void;

const MAX_VISIBLE = 3;

const NotificationContext = React.createContext<Notify>(() => {});

const TONE_STYLES: Record<Tone, { border: string; glow: string; label: MessageKey }> = {
  info: { border: "#a3e635", glow: "rgba(163,230,53,0.25)", label: "notify.info" },
  success: { border: "#86efac", glow: "rgba(134,239,172,0.25)", label: "notify.success" },
  warning: { border: "#f59e0b", glow: "rgba(245,158,11,0.25)", label: "notify.warning" },
  danger: { border: "#ef4444", glow: "rgba(239,68,68,0.3)", label: "notify.danger" },
};

/** Тосты терминала: локализованные message бэкенда и ошибки действий в одном месте. */
export const NotificationProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const tr = useT();
  const [items, setItems] = React.useState<Notice[]>([]);
  const counter = React.useRef(0);

  const dismiss = React.useCallback((id: number) => setItems((prev) => prev.filter((n) => n.id !== id)), []);

  const notify = React.useCallback<Notify>(
    ({ title, message, tone = "info", ttl = 5200 }) => {
      if (!message) return;
      const id = ++counter.current;
      // одинаковое уведомление (частые клики) не копится стопкой, а перезапускается;
      // на экране не больше трёх
      setItems((prev) => [
        ...prev.filter((n) => n.title !== title || n.message !== message).slice(-(MAX_VISIBLE - 1)),
        { id, title, message, tone },
      ]);
      window.setTimeout(() => dismiss(id), ttl);
    },
    [dismiss],
  );

  return (
    <NotificationContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed right-3 bottom-20 z-[90] flex w-[min(380px,calc(100vw-1.5rem))] flex-col gap-2 md:bottom-4" aria-live="polite">
        {items.map((n) => {
          const t = TONE_STYLES[n.tone];
          return (
            <div
              key={n.id}
              className="toast panel pointer-events-auto px-4 py-3"
              style={{ borderLeft: `4px solid ${t.border}`, boxShadow: `0 10px 30px rgba(0,0,0,0.45), 0 0 18px ${t.glow}` }}
              role="status"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="hud-label" style={{ color: t.border }}>
                    {tr(t.label)} • {n.title}
                  </div>
                  <div className="mt-1 text-[0.8rem] leading-snug whitespace-pre-line text-white/90">{n.message}</div>
                </div>
                <button
                  onClick={() => dismiss(n.id)}
                  className="hud-label shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-white/70 hover:border-white/50 hover:text-white"
                  aria-label={tr("common.close")}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
};

export function useNotify(): Notify {
  return React.useContext(NotificationContext);
}

/** Текст ошибки: ApiError уже несёт локализованное сообщение бэкенда. */
export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
