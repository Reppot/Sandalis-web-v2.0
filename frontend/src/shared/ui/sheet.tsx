"use client";

import * as React from "react";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { Icon } from "@/shared/ui/icons";

/* Заголовки таблицы «как в Google Таблицах»: клик — сортировка, воронка — фильтр по значениям. */

export type SortDir = "asc" | "desc";
export interface SheetSort {
  key: string;
  dir: SortDir;
}

export interface SheetFilter {
  options: { value: string; label: string; count?: number }[];
  /** null — фильтр выключен (видны все значения). */
  selected: Set<string> | null;
  onChange: (next: Set<string> | null) => void;
}

/** Следующее состояние сортировки по клику: по возрастанию → по убыванию → без сортировки. */
export function nextSort(current: SheetSort | null, key: string): SheetSort | null {
  if (!current || current.key !== key) return { key, dir: "asc" };
  return current.dir === "asc" ? { key, dir: "desc" } : null;
}

/** Сортировка строк по значению столбца (числа — как числа, строки — по алфавиту языка). */
export function sortRows<T>(rows: T[], sort: SheetSort | null, value: (row: T, key: string) => string | number): T[] {
  if (!sort) return rows;
  const k = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a, sort.key);
    const y = value(b, sort.key);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
    return c * k;
  });
}

export const SheetHead: React.FC<{
  label: React.ReactNode;
  sortKey?: string;
  sort?: SheetSort | null;
  onSort?: (next: SheetSort | null) => void;
  filter?: SheetFilter;
  className?: string;
}> = ({ label, sortKey, sort, onSort, filter, className }) => {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const ref = React.useRef<HTMLTableCellElement>(null);
  const active = sortKey && sort?.key === sortKey ? sort.dir : null;
  const filtered = Boolean(filter?.selected);

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const toggleValue = (value: string) => {
    if (!filter) return;
    const all = filter.options.map((o) => o.value);
    const next = new Set(filter.selected ?? all);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    filter.onChange(next.size === all.length ? null : next);
  };
  const shown = filter ? filter.options.filter((o) => !query.trim() || o.label.toLowerCase().includes(query.trim().toLowerCase())) : [];

  return (
    <th ref={ref} className={cn("sheet-th", className)} aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : undefined}>
      <div className="sheet-th-inner">
        {sortKey && onSort ? (
          <button type="button" className={cn("sheet-sort", active && "is-active")} onClick={() => onSort(nextSort(sort ?? null, sortKey))} title={t("sheet.sortHint")}>
            <span>{label}</span>
            <Icon name="chevronDown" size={13} className={cn("sheet-sort-icon", active === "asc" && "rotate-180", !active && "opacity-0")} />
          </button>
        ) : (
          <span>{label}</span>
        )}
        {filter ? (
          <button type="button" className={cn("sheet-filter-btn", (open || filtered) && "is-active")} onClick={() => setOpen((v) => !v)} aria-label={t("sheet.filter")} aria-expanded={open} title={t("sheet.filter")}>
            <Icon name="filter" size={13} />
          </button>
        ) : null}
      </div>
      {open && filter ? (
        <div className="sheet-pop" role="dialog" aria-label={t("sheet.filter")}>
          {sortKey && onSort ? (
            <div className="sheet-pop-sort">
              <button type="button" className={cn("sheet-pop-row", active === "asc" && "is-on")} onClick={() => onSort({ key: sortKey, dir: "asc" })}>{t("sheet.sortAsc")}</button>
              <button type="button" className={cn("sheet-pop-row", active === "desc" && "is-on")} onClick={() => onSort({ key: sortKey, dir: "desc" })}>{t("sheet.sortDesc")}</button>
            </div>
          ) : null}
          {filter.options.length > 8 ? (
            <input className="field mb-1.5 h-8 min-h-0 text-xs" placeholder={t("sheet.search")} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          ) : null}
          <div className="sheet-pop-actions">
            <button type="button" onClick={() => filter.onChange(null)}>{t("sheet.selectAll")}</button>
            <button type="button" onClick={() => filter.onChange(new Set())}>{t("sheet.clear")}</button>
          </div>
          <ul className="sheet-pop-list">
            {shown.map((o) => {
              const on = !filter.selected || filter.selected.has(o.value);
              return (
                <li key={o.value}>
                  <label className="sheet-pop-item">
                    <input type="checkbox" checked={on} onChange={() => toggleValue(o.value)} />
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.count !== undefined ? <span className="text-fg-3 tabular">{o.count}</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </th>
  );
};
