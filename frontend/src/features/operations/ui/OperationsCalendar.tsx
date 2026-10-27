"use client";

import * as React from "react";
import { byDate, isoDate, parseDate, today, type Operation } from "@/features/operations/model/operations";
import { Icon, cn, useI18n } from "@/shared";

/**
 * Календарь операций клана: месяц сеткой с понедельника, в дне — названия операций
 * (занятые дни подсвечены). Клик по дню выбирает дату — для новой операции или фильтра.
 */
export const OperationsCalendar: React.FC<{
  operations: Operation[];
  selected: string | null;
  onSelect: (date: string) => void;
  /** Компактно (в окне «Перенести в операции»): точки вместо названий, выбор прошедших дней запрещён. */
  compact?: boolean;
}> = ({ operations, selected, onSelect, compact }) => {
  const { t, locale } = useI18n();
  const [month, setMonth] = React.useState(() => {
    const d = parseDate(selected ?? today());
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const days = byDate(operations);
  const now = today();

  // 6 недель с понедельника, захватывая края соседних месяцев
  const first = new Date(month);
  first.setDate(1 - ((month.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    return d;
  });
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 0, 1 + i)));
  const title = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month);
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <div className={cn("ops-cal", compact && "is-compact")}>
      <div className="ops-cal-head">
        <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label={t("operations.prevMonth")} title={t("operations.prevMonth")}><Icon name="chevronLeft" size={16} /></button>
        <span className="ops-cal-title">{title}</span>
        <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label={t("operations.nextMonth")} title={t("operations.nextMonth")}><Icon name="chevronRight" size={16} /></button>
        <button type="button" className="btn ml-auto h-8 min-h-0 px-2.5 text-xs" onClick={() => {
          const d = new Date();
          setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
        }}>{t("operations.today")}</button>
      </div>
      <div className="ops-cal-grid" role="grid">
        {weekdays.map((w) => <div key={w} className="ops-cal-wd">{w}</div>)}
        {cells.map((d) => {
          const key = isoDate(d);
          const ops = days.get(key) ?? [];
          const past = key < now;
          const outside = d.getMonth() !== month.getMonth();
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              className={cn("ops-cal-day", outside && "is-outside", past && "is-past", key === now && "is-today", ops.length > 0 && "is-busy", key === selected && "is-selected")}
              disabled={compact && past}
              onClick={() => onSelect(key)}
              aria-pressed={key === selected}
              aria-label={`${key}${ops.length ? ` — ${ops.map((o) => o.title).join(", ")}` : ""}`}
              title={ops.map((o) => o.title).join("\n") || undefined}
            >
              <span className="ops-cal-num">{d.getDate()}</span>
              {compact ? (
                ops.length ? <span className="ops-cal-dots">{ops.slice(0, 3).map((o) => <i key={o.id} />)}</span> : null
              ) : (
                <span className="ops-cal-list">
                  {ops.slice(0, 3).map((o) => <span key={o.id} className="ops-cal-op">{o.title}</span>)}
                  {ops.length > 3 ? <span className="ops-cal-more">+{ops.length - 3}</span> : null}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
