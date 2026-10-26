"use client";

import * as React from "react";
import { useT, type MessageKey } from "@/shared/i18n";
import { Icon, type IconName } from "@/shared/ui/icons";

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

const TONES: Record<Tone, { icon: IconName; label: MessageKey }> = {
  info: { icon: "info", label: "notify.info" },
  success: { icon: "check", label: "notify.success" },
  warning: { icon: "warning", label: "notify.warning" },
  danger: { icon: "warning", label: "notify.danger" },
};

/** Уведомления: локализованные message бэкенда и ошибки действий в одном месте. */
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
      <div className="toast-stack" aria-live="polite">
        {items.map((n) => {
          const tone = TONES[n.tone];
          return (
            <div key={n.id} className={`toast is-${n.tone}`} role="status">
              <span className="toast-icon" aria-hidden>
                <Icon name={tone.icon} size={16} strokeWidth={2.4} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="toast-title">{n.title || tr(tone.label)}</div>
                <div className="toast-message">{n.message}</div>
              </div>
              <button onClick={() => dismiss(n.id)} className="toast-close" aria-label={tr("common.close")}>
                <Icon name="close" size={14} />
              </button>
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
