"use client";

import * as React from "react";
import { cn } from "@/shared/lib/utils";

/* Базовые элементы терминала поверх классов .btn/.field/.panel из globals.css. */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger" | "warn";
  active?: boolean;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", active, isLoading, disabled, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      className={cn(
        "btn",
        variant === "primary" && "btn-primary",
        variant === "danger" && "btn-danger",
        variant === "warn" && "btn-warn",
        active && "btn-active",
        className,
      )}
      {...props}
    >
      {isLoading ? <span className="pulse">ПЕРЕДАЧА...</span> : children}
    </button>
  ),
);
Button.displayName = "Button";

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  mono?: boolean;
}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(({ label, mono, className, id, ...props }, ref) => {
  const generated = React.useId();
  const inputId = id ?? generated;
  const input = <input ref={ref} id={inputId} className={cn("field", mono && "field-mono", className)} {...props} />;
  if (!label) return input;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1">
      <span className="hud-label text-muted">{label}</span>
      {input}
    </label>
  );
});
Field.displayName = "Field";

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }> = ({ label, className, children, ...props }) => {
  const select = (
    <select className={cn("field", className)} {...props}>
      {children}
    </select>
  );
  if (!label) return select;
  return (
    <label className="flex flex-col gap-1">
      <span className="hud-label text-muted">{label}</span>
      {select}
    </label>
  );
};

export const Panel: React.FC<React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "aside" }> = ({ as: Tag = "section", className, ...props }) => (
  <Tag className={cn("panel panel-corners rounded-md", className)} {...props} />
);

export const Loading: React.FC<{ label?: string; className?: string }> = ({ label = "📡 ЗАГРУЗКА ДАННЫХ...", className }) => (
  <div className={cn("hud-label flex min-h-[160px] items-center justify-center text-muted", className)}>
    <span className="pulse">{label}</span>
  </div>
);

export const EmptyState: React.FC<{ icon?: string | null; title: string; hint?: string; children?: React.ReactNode }> = ({ icon, title, hint, children }) => (
  <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 px-4 text-center">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {icon && <img src={icon} alt="" width={56} height={56} className="ui-icon opacity-70" />}
    <div className="text-sm text-white/85">{title}</div>
    {hint && <div className="hud-label text-muted">{hint}</div>}
    {children}
  </div>
);

/** Иконка из нескольких источников по приоритету; без картинки — буква-заглушка. */
export const ItemIcon: React.FC<{ sources: ReadonlyArray<string | null | undefined>; size: number; label: string; className?: string }> = ({ sources, size, label, className }) => {
  const [failed, setFailed] = React.useState<string[]>([]);
  const src = sources.find((s): s is string => typeof s === "string" && s.length > 0 && !failed.includes(s));
  const frame = cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded border border-[rgba(163,230,53,0.18)] bg-[#0b100c]", className);
  if (!src) {
    return (
      <span className={cn(frame, "font-display text-accent/60")} style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) }} aria-label={`Нет иконки: ${label}`}>
        {label.replace(/[^a-z0-9а-яё]+/giu, "").charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    <span className={frame} style={{ width: size, height: size, padding: Math.max(1, Math.round(size * 0.05)) }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- цепочка onError-фолбэков */}
      <img
        key={src}
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="h-full w-full object-contain"
        onError={() => setFailed((prev) => (prev.includes(src) ? prev : [...prev, src]))}
      />
    </span>
  );
};

/** «− [число] ＋» с ручным вводом; 0 — удалить строку (решает родитель). */
export const QuantityStepper: React.FC<{ value: number; onChange: (next: number) => void; unit?: string; label: string }> = ({ value, onChange, unit, label }) => {
  const [draft, setDraft] = React.useState<string | null>(null);
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" className="btn px-2 py-1" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Уменьшить: ${label}`}>
        −
      </button>
      <label className="factory-qty flex min-w-[78px] items-center justify-center gap-1">
        <input
          type="text"
          inputMode="numeric"
          aria-label={`Количество: ${label}`}
          className="w-12 min-w-0 bg-transparent text-center text-[0.8rem] font-bold text-white outline-none"
          value={draft ?? String(value)}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "").slice(0, 7);
            if (!raw) return setDraft("");
            setDraft(null);
            onChange(Number(raw));
          }}
          onBlur={() => {
            if (draft === "") {
              setDraft(null);
              onChange(0);
            }
          }}
        />
        {unit ? <span className="shrink-0">{unit}</span> : null}
      </label>
      <button type="button" className="btn px-2 py-1" onClick={() => onChange(value + 1)} aria-label={`Увеличить: ${label}`}>
        ＋
      </button>
    </div>
  );
};

/** Кнопка-подтверждение: первый клик взводит, второй (в течение 3 с) выполняет. */
export function useConfirm(timeoutMs = 3000): [string | null, (key: string, action: () => void) => void] {
  const [armed, setArmed] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(null), timeoutMs);
    return () => window.clearTimeout(t);
  }, [armed, timeoutMs]);
  const trigger = React.useCallback(
    (key: string, action: () => void) => {
      if (armed === key) {
        setArmed(null);
        action();
      } else setArmed(key);
    },
    [armed],
  );
  return [armed, trigger];
}
