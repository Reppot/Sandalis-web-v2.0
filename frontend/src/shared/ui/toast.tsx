"use client";

import * as React from "react";
import { cn } from "@/shared/lib/utils";

type ToastKind = "success" | "error";

interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

type Notify = (text: string, kind?: ToastKind) => void;

const ToastContext = React.createContext<Notify>(() => {});

/** Локализованные `message` из ответов API и ошибки действий — в одном месте. */
export const ToastProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(0);

  const notify = React.useCallback<Notify>((text, kind = "success") => {
    if (!text) return;
    const id = ++nextId.current;
    setItems((prev) => [...prev, { id, kind, text }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-md border px-3 py-2 text-xs font-mono shadow-lg bg-sindaris-panel",
              t.kind === "success" ? "border-green-700/60 text-green-300" : "border-red-800/70 text-red-300"
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): Notify {
  return React.useContext(ToastContext);
}

/** Текст ошибки для тоста: ApiError уже несёт локализованное сообщение бэкенда. */
export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
