export type ItemCategory = 
  | "small_arms" 
  | "heavy_arms" 
  | "utilities" 
  | "medical" 
  | "resources" 
  | "uniforms" 
  | "vehicles";

export interface FoxholeItem {
  id: string;               // Уникальный строковый ID (например, "soldier_supplies")
  code: string;             // Внутриигровой код предмета (например, "SS")
  name: string;             // Русское название
  englishName: string;      // Английское название
  category: ItemCategory;   // Категория предмета
  iconUrl: string | null;   // Ссылка на иконку в CDN/S3
  crateSize: number;        // Количество штук в ящике
  productionTime: number;   // Время крафта ящика в секундах
}

export interface RecipeIngredient {
  itemId: string;
  quantity: number;
}

export interface CraftRecipe {
  itemId: string;
  facility: string;         // Тип завода (MPF, Factory, Assembly Station и т.д.)
  ingredients: RecipeIngredient[];
  yieldQuantity: number;    // Сколько предметов/ящиков на выходе
}