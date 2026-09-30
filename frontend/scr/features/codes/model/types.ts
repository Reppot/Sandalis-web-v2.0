import type { FoxholeItem, ItemCategory } from "@/entities/item";

export interface CodeSearchFilters {
  query: string;
  category: ItemCategory | "all";
}