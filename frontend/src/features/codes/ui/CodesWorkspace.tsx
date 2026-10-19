"use client";

import * as React from "react";
import type { FoxholeItem } from "@/entities/item";
import { Input, Button, Spinner, errorText } from "@/shared";
import { CODES_PAGE_SIZE, codesApi } from "@/features/codes/api/codesApi";
import type { CodeSearchFilters } from "@/features/codes/model/types";
import { CodeCard } from "@/features/codes/ui/CodeCard";

const categories: { label: string; value: CodeSearchFilters["category"] }[] = [
  { label: "Все", value: "all" },
  { label: "Стрелковое", value: "small_arms" },
  { label: "Тяжелое", value: "heavy_arms" },
  { label: "Снаряжение", value: "utilities" },
  { label: "Медицина", value: "medical" },
  { label: "Ресурсы", value: "resources" },
  { label: "Униформа", value: "uniforms" },
  { label: "Техника", value: "vehicles" },
];

export const CodesWorkspace: React.FC = () => {
  const [items, setItems] = React.useState<FoxholeItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<CodeSearchFilters>({
    query: "",
    category: "all",
  });

  React.useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoading(true);
      codesApi
        .list(filters.query, filters.category === "all" ? undefined : filters.category)
        .then((page) => {
          if (!cancelled) {
            setItems(page.items);
            setTotal(page.total);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setItems([]);
            setTotal(0);
            setError(errorText(err, "Не удалось загрузить каталог"));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [filters.query, filters.category]);

  const category = filters.category === "all" ? undefined : filters.category;

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await codesApi.list(filters.query, category, items.length);
      setItems((prev) => [...prev, ...page.items]);
      setTotal(page.total);
    } catch (err) {
      setError(errorText(err, "Не удалось загрузить каталог"));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-sindaris-border">
        <h2 className="text-xl font-bold text-sindaris-accent tracking-wide">БАЗА КОДОВ ПРЕДМЕТОВ</h2>
        <p className="text-xs text-sindaris-muted">Быстрый поиск сокращений и номенклатуры Foxhole</p>
      </div>

      <div className="space-y-3">
        <Input
          placeholder="Поиск по коду (SS, Rmats, HE...), русскому или английскому названию..."
          value={filters.query}
          onChange={(e) => setFilters({ ...filters, query: e.target.value })}
        />

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <Button
              key={cat.value}
              size="sm"
              variant={filters.category === cat.value ? "primary" : "secondary"}
              onClick={() => setFilters({ ...filters, category: cat.value })}
            >
              {cat.label}
            </Button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center rounded-lg border border-dashed border-sindaris-border text-sindaris-muted font-mono">
          Предметов по данному запросу не найдено.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((item) => (
              <CodeCard key={item.id} item={item} />
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-sindaris-muted">
            <span>
              Показано {items.length} из {total}
            </span>
            {items.length < total && (
              <Button size="sm" variant="secondary" isLoading={loadingMore} onClick={() => void loadMore()}>
                Показать ещё {Math.min(CODES_PAGE_SIZE, total - items.length)}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
