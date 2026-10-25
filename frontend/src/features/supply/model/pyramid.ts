import { apiClient } from "@/shared";

/** Пирамида снабжения клана (GET/PUT/DELETE /api/v1/clan/pyramid). tiers[0] — основа. */
export interface PyramidItem {
  code: string;
  crates: number;
}
export interface PyramidTier {
  title: string;
  items: PyramidItem[];
}
export type PyramidFaction = "warden" | "colonial";
/** Кастомная конфигурация клана (до max_configs): видна всем участникам в списке конфигураций. */
export interface PyramidConfig {
  id: string;
  name: string;
  faction: PyramidFaction;
  tiers: PyramidTier[];
  updated_at: string | null;
  updated_by: string | null;
}
export interface PyramidConfigInput {
  name: string;
  faction: PyramidFaction;
  tiers: PyramidTier[];
}
export interface Pyramid {
  faction: PyramidFaction;
  tiers: PyramidTier[];
  is_default: boolean;
  updated_at: string | null;
  /** Готовые конфигурации (normal, basic, tank, artillery, builder, frontline). */
  presets: { key: string; tiers: PyramidTier[] }[];
  configs: PyramidConfig[];
  max_configs: number;
}

export const pyramidApi = {
  get: () => apiClient.get<Pyramid>("/api/v1/clan/pyramid"),
  create: (data: PyramidConfigInput) => apiClient.post<Pyramid>("/api/v1/clan/pyramid/configs", data),
  update: (id: string, data: PyramidConfigInput) => apiClient.put<Pyramid>(`/api/v1/clan/pyramid/configs/${id}`, data),
  remove: (id: string) => apiClient.delete<Pyramid>(`/api/v1/clan/pyramid/configs/${id}`),
};

export interface PyramidCell {
  code: string;
  target: number;
  have: number;
  missing: number;
}
export interface PyramidLevel {
  index: number;
  title: string;
  cells: PyramidCell[];
  missing: number;
  target: number;
  done: boolean;
}

/**
 * Сравнение пирамиды со складом (количество на складе — в ящиках). Предметы чужой
 * фракции скрыты. Уровень закрыт, когда каждой позиции хватает до цели.
 */
export function evaluatePyramid(
  pyramid: Pick<Pyramid, "faction" | "tiers">,
  stock: ReadonlyMap<string, number>,
  factionOf: (code: string) => string | undefined,
): PyramidLevel[] {
  return pyramid.tiers.map((tier, index) => {
    const cells = tier.items
      .filter((i) => {
        const f = factionOf(i.code);
        return !f || f === "neutral" || f === pyramid.faction;
      })
      .map((i) => {
        const have = stock.get(i.code) ?? 0;
        return { code: i.code, target: i.crates, have, missing: Math.max(0, i.crates - have) };
      });
    const missing = cells.reduce((n, c) => n + c.missing, 0);
    return { index, title: tier.title, cells, missing, target: cells.reduce((n, c) => n + c.target, 0), done: missing === 0 };
  });
}

/** Первый (снизу) незакрытый уровень — его везём сейчас; -1 — пирамида закрыта. */
export const currentLevel = (levels: PyramidLevel[]) => levels.findIndex((l) => !l.done);
