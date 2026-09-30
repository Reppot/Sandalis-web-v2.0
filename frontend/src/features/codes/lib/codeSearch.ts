import type { FoxholeItem } from "@/entities/item";
import type { CodeSearchFilters } from "@/features/codes/model/types";

export function filterCodes(items: FoxholeItem[], filters: CodeSearchFilters): FoxholeItem[] {
  return items.filter((item) => {
    const matchesCategory = filters.category === "all" || item.category === filters.category;
    const q = filters.query.toLowerCase().trim();
    const matchesQuery =
      q === "" ||
      item.code.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.englishName.toLowerCase().includes(q);

    return matchesCategory && matchesQuery;
  });
}