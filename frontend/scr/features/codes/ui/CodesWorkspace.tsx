"use client";

import * as React from "react";
import type { FoxholeItem, ItemCategory } from "@/entities/item";
import { Input, Button, Spinner } from "@/shared";
import { codesApi } from "@/features/codes/api/codesApi";
import { filterCodes } from "@/features/codes/lib/codeSearch";
import type { CodeSearchFilters } from "@/features/codes/model/types";
import { CodeCard } from "@/features/codes/ui/CodeCard";

const categories: { label: string; value: ItemCategory | "all" }[] = [
  { label: "Все", value: "all" },
  { label: "Стрелковое", value: "small_arms" },
  { label: "Тяжелое", value: "heavy_arms" },
  { label: "Снаряжение", value: "utilities" },
  { label: "Медицина", value: "medical" },
  { label: "Ресурсы", value: "resources" },
  { label: "Техника", value: "vehicles" },
];

export const CodesWorkspace: React.FC = () => {
  const [items, setItems] = React.useState<FoxholeItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filters, setFilters] = React.useState<CodeSearchFilters>({
    query: "",
    category: "all",
  });

  React.useEffect(() => {
    codesApi
      .list()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filterCodes(items, filters);

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

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center rounded-lg border border-dashed border-sindaris-border text-sindaris-muted font-mono">
          Предметов по данному запросу не найдено.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((item) => (
            <CodeCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};