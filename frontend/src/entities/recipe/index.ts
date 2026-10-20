import { apiClient } from "@/shared";

/** Рецепт Factory/MPF/Refinery (GET /api/v1/recipes). */
export interface Recipe {
  id: string;
  kind: "factory" | "refinery";
  name: string;
  name_en: string | null;
  item_code: string | null;
  category: string;
  item_class: string | null;
  description: string | null;
  factions: string[];
  facilities: string[];
  icon_url: string | null;
  output_quantity: number;
  cost: Record<string, number>;
  data: Record<string, unknown>;
}

export interface RefineryData {
  input: string;
  input_per_unit: number;
  seconds_per_unit: number;
  crate_size: number;
  unit_label: string;
  personal_limit: number;
}

/** Данные MPF из foxhole.wiki.gg (recipe.data.mpf): база за ящик, время, лимит заказа. */
export interface MpfData {
  /** Время производства одного ящика без ускорения очередью, сек. */
  seconds: number;
  /** Предметов в ящике MPF. */
  amount: number;
  /** Базовая цена одного ящика (до скидки). */
  cost: Record<string, number>;
  /** Максимум ящиков в одном заказе: 9 — предметы, 5 — техника и сооружения. */
  max_crates: number;
}

export const MPF_MIN_CRATES = 3;

export function mpfData(recipe: Recipe): MpfData | null {
  const value = recipe.data?.mpf as MpfData | undefined;
  return value && typeof value.seconds === "number" ? value : null;
}

/**
 * Стоимость одного заказа MPF из n ящиков по одному ресурсу: i-й ящик заказа
 * получает скидку 10%·i, но не больше 50%, и округляется вниз отдельно
 * (сверено со всеми таблицами foxhole.wiki.gg: 3–9 ящиков, 175 позиций).
 */
export function mpfOrderCost(base: number, crates: number): number {
  let total = 0;
  for (let i = 1; i <= crates; i += 1) total += Math.floor((base * (10 - Math.min(i, 5))) / 10);
  return total;
}

/** Разбивка количества на заказы: в игре один заказ — до max ящиков одного типа. */
export function mpfOrders(crates: number, max: number): number[] {
  const orders: number[] = [];
  for (let left = crates; left > 0; left -= max) orders.push(Math.min(left, max));
  return orders;
}

export const recipeApi = {
  list(kind: Recipe["kind"]): Promise<Recipe[]> {
    return apiClient.get<Recipe[]>("/api/v1/recipes", { params: { kind } });
  },
};
