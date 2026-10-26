"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import type { UiIcon } from "@/shared/config/assets";
import { UiGlyph } from "@/shared/ui/glyph";

/* Базовые элементы терминала поверх классов .btn/.field/.panel из globals.css. */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger" | "warn";
  active?: boolean;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", active, isLoading, disabled, children, type = "button", ...props }, ref) => {
    const t = useT();
    return (
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
      {isLoading ? <span className="pulse">{t("common.sending")}</span> : children}
    </button>
    );
  },
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
    <label htmlFor={inputId} className="flex flex-col gap-1.5">
      <span className="field-label">{label}</span>
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
    <label className="flex flex-col gap-1.5">
      <span className="field-label">{label}</span>
      {select}
    </label>
  );
};

/** Сегментированный переключатель: 2–4 взаимоисключающих варианта (ящики / штуки, фракции…). */
export function Segmented<T extends string>({ options, value, onChange, label, size = "md", className }: {
  options: ReadonlyArray<{ value: T; label: React.ReactNode; title?: string }>;
  value: T;
  onChange: (next: T) => void;
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div className={cn("segmented", `is-${size}`, className)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} title={o.title} className={cn("segmented-item", o.value === value && "is-active")} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Поле поиска с лупой и кнопкой очистки. */
export const SearchField = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "size"> & { value: string; onChange: (next: string) => void; size?: "md" | "lg" }>(
  ({ value, onChange, className, size = "md", ...props }, ref) => {
    const t = useT();
    return (
      <label className={cn("search-field", `is-${size}`, className)}>
        <svg className="search-field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input ref={ref} type="search" className="search-field-input" value={value} onChange={(e) => onChange(e.target.value)} {...props} />
        {value ? (
          <button type="button" className="search-field-clear" onClick={() => onChange("")} aria-label={t("common.clear")}>
            ✕
          </button>
        ) : null}
      </label>
    );
  },
);
SearchField.displayName = "SearchField";

/** Заголовок блока внутри карточки: название слева, действия справа. */
export const SectionHeader: React.FC<{ title: React.ReactNode; icon?: UiIcon; meta?: React.ReactNode; actions?: React.ReactNode; className?: string; as?: "h2" | "h3" }> = ({ title, icon, meta, actions, className, as: Tag = "h2" }) => (
  <div className={cn("section-header", className)}>
    <div className="flex min-w-0 items-center gap-2.5">
      {icon ? <span className="icon-tile h-8 w-8 rounded-[10px]"><UiGlyph icon={icon} size={18} /></span> : null}
      <Tag className="panel-title truncate">{title}</Tag>
      {meta ? <span className="flex shrink-0 items-center gap-1.5">{meta}</span> : null}
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </div>
);

/** Шапка страницы-раздела: значок, надзаголовок, заголовок, пояснение, действия справа. */
export const PageHeader: React.FC<{ icon?: UiIcon | React.ReactNode; eyebrow?: React.ReactNode; title: React.ReactNode; lead?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string; guide?: string }> = ({ icon, eyebrow, title, lead, actions, children, className, guide }) => (
  <section data-guide={guide} className={cn("panel page-header", className)}>
    <div className="page-header-main">
      {icon ? <span className="page-header-icon">{typeof icon === "string" ? <UiGlyph icon={icon as UiIcon} size={26} /> : icon}</span> : null}
      <div className="page-header-text">
        {eyebrow ? <div className="page-eyebrow">{eyebrow}</div> : null}
        <h1 className="page-header-title">{title}</h1>
        {lead ? <p className="page-header-lead">{lead}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </div>
    {children}
  </section>
);

export const Panel: React.FC<React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "aside" }> = ({ as: Tag = "section", className, ...props }) => (
  <Tag className={cn("panel", className)} {...props} />
);

/**
 * Загрузка: мягкий скелетон строк и подпись. skeleton={false} — только спиннер
 * (для маленьких вставок внутри карточек).
 */
export const Loading: React.FC<{ label?: string; className?: string; rows?: number; skeleton?: boolean }> = ({ label, className, rows = 3, skeleton = true }) => {
  const t = useT();
  if (!skeleton) {
    return (
      <div className={cn("flex min-h-[160px] items-center justify-center", className)} role="status">
        <span className="loading-label"><span className="spinner" aria-hidden />{label ?? t("common.loading")}</span>
      </div>
    );
  }
  return (
    <div className={cn("loading-block", className)} role="status" aria-live="polite">
      <div className="loading-rows" aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="loading-row">
            <span className="skeleton h-9 w-9 shrink-0 rounded-[10px]" />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="skeleton h-3" style={{ width: `${[62, 48, 74, 55][i % 4]}%` }} />
              <span className="skeleton h-2.5" style={{ width: `${[36, 28, 42, 31][i % 4]}%` }} />
            </span>
          </div>
        ))}
      </div>
      <span className="loading-label">{label ?? t("common.loading")}</span>
    </div>
  );
};

/** Пустое состояние: значок, понятный заголовок, подсказка, что делать дальше, и кнопки. */
export const EmptyState: React.FC<{ icon?: UiIcon | null; title: string; hint?: string; children?: React.ReactNode; actions?: React.ReactNode }> = ({ icon, title, hint, children, actions }) => (
  <div className="empty-state">
    {icon && (
      <span className="empty-state-icon">
        <UiGlyph icon={icon} size={30} />
      </span>
    )}
    <div className="empty-state-title">{title}</div>
    {hint && <div className="empty-state-hint">{hint}</div>}
    {actions ? <div className="empty-state-actions">{actions}</div> : null}
    {children}
  </div>
);

/**
 * Подсказка «?» рядом с полем или заголовком: открывается наведением, фокусом или нажатием.
 * Всплывашка живёт в портале с position: fixed — её не обрезают карточки с overflow: hidden;
 * встаёт над кнопкой, а если сверху мало места — под ней.
 */
export const Hint: React.FC<{ children: React.ReactNode; label?: string; className?: string }> = ({ children, label, className }) => {
  const t = useT();
  const [pos, setPos] = React.useState<{ left: number; top: number; below: boolean } | null>(null);
  const ref = React.useRef<HTMLSpanElement>(null);
  const id = React.useId();
  const show = React.useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const half = Math.min(144, window.innerWidth / 2 - 12);
    const left = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8);
    const below = r.top < 160;
    setPos({ left, top: below ? r.bottom + 8 : r.top - 8, below });
  }, []);
  const hide = React.useCallback(() => setPos(null), []);
  React.useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) hide();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [pos, hide]);
  return (
    <span ref={ref} className={cn("hint", pos && "is-open", className)} onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        className="hint-btn"
        aria-label={label ?? t("common.whatIsThis")}
        aria-expanded={Boolean(pos)}
        aria-describedby={pos ? id : undefined}
        // фокус уже открыл подсказку — клик её не закрывает; закрывают Escape, клик мимо и уход фокуса
        onClick={(e) => {
          e.stopPropagation();
          show();
        }}
        onFocus={show}
        onBlur={hide}
      >
        ?
      </button>
      {pos
        ? createPortal(
            <span id={id} role="tooltip" className={cn("hint-pop", pos.below && "is-below")} style={{ left: pos.left, top: pos.top }}>
              {children}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
};

/** Иконка из нескольких источников по приоритету; без картинки — буква-заглушка. */
export const ItemIcon: React.FC<{ sources: ReadonlyArray<string | null | undefined>; size: number; label: string; className?: string }> = ({ sources, size, label, className }) => {
  const t = useT();
  const [failed, setFailed] = React.useState<string[]>([]);
  const src = sources.find((s): s is string => typeof s === "string" && s.length > 0 && !failed.includes(s));
  const frame = cn("item-icon", className);
  if (!src) {
    return (
      <span className={cn(frame, "font-semibold text-fg-3")} style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) }} aria-label={t("common.noIcon", { name: label })}>
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
  const t = useT();
  const [draft, setDraft] = React.useState<string | null>(null);
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" className="stepper-btn" onClick={() => onChange(Math.max(0, value - 1))} aria-label={t("common.decrease", { name: label })}>
        −
      </button>
      <label className="factory-qty flex min-w-[78px] items-center justify-center gap-1">
        <input
          type="text"
          inputMode="numeric"
          aria-label={t("common.quantityOf", { name: label })}
          className="w-12 min-w-0 bg-transparent text-center text-[0.8rem] font-semibold text-fg outline-none"
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
      <button type="button" className="stepper-btn" onClick={() => onChange(value + 1)} aria-label={t("common.increase", { name: label })}>
        +
      </button>
    </div>
  );
};

/**
 * Постраничный вывод больших списков: сначала `step` строк, дальше — «Загрузить ещё».
 * Счётчик сбрасывается при смене resetKey (поиск, фильтр), но не при фоновом обновлении данных.
 */
export interface Paged<T> {
  items: T[];
  shown: number;
  total: number;
  next: number;
  more: () => void;
}
export function usePaged<T>(items: readonly T[], step = 50, resetKey?: unknown): Paged<T> {
  const [limit, setLimit] = React.useState(step);
  React.useEffect(() => setLimit(step), [resetKey, step]);
  const shown = Math.min(limit, items.length);
  return {
    items: items.slice(0, limit),
    shown,
    total: items.length,
    next: Math.min(step, items.length - shown),
    more: () => setLimit((l) => l + step),
  };
}

/** «Показано N из M» + кнопка «Загрузить ещё». next=0 — кнопка скрыта. */
export const LoadMore: React.FC<{ shown: number; total?: number | null; next: number; onMore: () => void; busy?: boolean }> = ({ shown, total, next, onMore, busy }) => {
  const t = useT();
  if (next <= 0 && (total == null || total <= shown)) return null;
  return (
    <div className="load-more">
      <span className="text-xs">{t("common.shownOf", { shown, total: total ?? "?" })}</span>
      {next > 0 && (
        <button type="button" className="btn" disabled={busy} onClick={onMore}>
          {busy ? t("common.loading") : t("common.loadMore", { n: next })}
        </button>
      )}
    </div>
  );
};

export const PagedMore: React.FC<{ page: Paged<unknown> }> = ({ page }) => (
  <LoadMore shown={page.shown} total={page.total} next={page.next} onMore={page.more} />
);

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
