import { apiClient } from "@/shared";

/** Рецепт Factory/MPF/Refinery или постройки (GET /api/v1/recipes). */
export interface Recipe {
  id: string;
  kind: "factory" | "refinery" | "facility";
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

// --------------------------------------------------------------------------- //
// Рецепты построек (kind="facility", Cargo-таблица Production на foxhole.wiki.gg)
// --------------------------------------------------------------------------- //
export interface FacilityPart {
  name: string;
  amount: number;
  /** "L" — литры, иначе штуки. */
  unit: string | null;
  code: string | null;
  icon_url: string | null;
}

export interface FacilityData {
  /** Постройка: Materials Factory, Small Assembly Station, Factory... */
  source: string;
  /** Модификация постройки (Assembly Bay, Coal Liquefier...) или null — базовая. */
  module: string | null;
  inputs: FacilityPart[];
  /** Техника, которая нужна на входе (улучшения на сборочных станциях). */
  vehicle: string | null;
  power_mw: number;
  /** Время одного цикла, сек. */
  seconds: number;
  output_unit: string | null;
  byproducts: FacilityPart[];
}

export function facilityData(recipe: Recipe): FacilityData | null {
  const d = recipe.data as unknown as FacilityData | undefined;
  return d && Array.isArray(d.inputs) ? d : null;
}

/** Выбор по предмету: id рецепта или RAW — считать сырьём, не разбирать. */
export const RAW = "raw";
export type ChainChoice = Record<string, string>;

export interface ChainNode {
  name: string;
  amount: number;
  unit: string | null;
  icon_url: string | null;
  recipe: Recipe | null;
  /** Циклов производства (0 — сырьё). */
  runs: number;
  children: ChainNode[];
  /** Рецепт снова требует сам себя выше по цепочке — дальше не разбираем. */
  cycle: boolean;
}

export interface ChainTotals {
  raw: Map<string, { amount: number; unit: string | null; icon_url: string | null }>;
  byproducts: Map<string, { amount: number; unit: string | null; icon_url: string | null }>;
  /** Секунды работы по постройкам: внутри постройки циклы идут друг за другом. */
  seconds: Map<string, number>;
  runs: number;
  peakMw: number;
  /** МВт·ч за всю цепочку. */
  energyMwh: number;
}

/**
 * Дерево производства amount единиц предмета по рецепту recipe. Входы, для которых в
 * choice выбран рецепт, раскладываются дальше; остальные — сырьё. Циклов —
 * ceil(amount / выход за цикл): постройка не делает «пол-цикла».
 */
export function buildChain(
  part: { name: string; unit: string | null; icon_url: string | null },
  amount: number,
  recipe: Recipe | null,
  choice: ChainChoice,
  byId: Map<string, Recipe>,
  path: ReadonlySet<string> = new Set(),
): ChainNode {
  const data = recipe ? facilityData(recipe) : null;
  const cycle = Boolean(recipe && path.has(part.name));
  if (!recipe || !data || cycle) {
    return { ...part, amount, recipe: null, runs: 0, children: [], cycle };
  }
  const runs = Math.ceil(amount / Math.max(recipe.output_quantity, 1) - 1e-9);
  const next = new Set(path).add(part.name);
  const children = data.inputs.map((input) => {
    const picked = choice[input.name];
    const sub = picked && picked !== RAW ? byId.get(picked) ?? null : null;
    return buildChain(input, input.amount * runs, sub, choice, byId, next);
  });
  if (data.vehicle) children.push({ name: data.vehicle, amount: runs, unit: null, icon_url: null, recipe: null, runs: 0, children: [], cycle: false });
  return { ...part, amount, recipe, runs, children, cycle: false };
}

export function chainTotals(roots: ChainNode[]): ChainTotals {
  const totals: ChainTotals = { raw: new Map(), byproducts: new Map(), seconds: new Map(), runs: 0, peakMw: 0, energyMwh: 0 };
  const add = (map: ChainTotals["raw"], p: { name: string; unit: string | null; icon_url: string | null }, amount: number) => {
    const prev = map.get(p.name);
    map.set(p.name, { amount: (prev?.amount ?? 0) + amount, unit: p.unit, icon_url: prev?.icon_url ?? p.icon_url });
  };
  const walk = (node: ChainNode) => {
    const data = node.recipe ? facilityData(node.recipe) : null;
    if (!node.recipe || !data) return add(totals.raw, node, node.amount);
    totals.runs += node.runs;
    totals.seconds.set(data.source, (totals.seconds.get(data.source) ?? 0) + data.seconds * node.runs);
    totals.peakMw = Math.max(totals.peakMw, data.power_mw);
    totals.energyMwh += (data.power_mw * data.seconds * node.runs) / 3600;
    for (const b of data.byproducts) add(totals.byproducts, b, b.amount * node.runs);
    // излишек основного продукта (последний цикл делает больше, чем нужно)
    const surplus = node.runs * node.recipe.output_quantity - node.amount;
    if (surplus > 1e-9) add(totals.byproducts, node, surplus);
    node.children.forEach(walk);
  };
  roots.forEach(walk);
  return totals;
}

export const recipeApi = {
  list(kind: Recipe["kind"]): Promise<Recipe[]> {
    return apiClient.get<Recipe[]>("/api/v1/recipes", { params: { kind } });
  },
};
