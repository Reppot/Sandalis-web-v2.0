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

export const recipeApi = {
  list(kind: Recipe["kind"]): Promise<Recipe[]> {
    return apiClient.get<Recipe[]>("/api/v1/recipes", { params: { kind } });
  },
};
