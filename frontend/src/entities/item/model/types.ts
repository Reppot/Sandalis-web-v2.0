export type ItemCategory = string;

export interface FoxholeItem {
  id: string;
  code: string;
  name: string;
  englishName: string;
  category: ItemCategory;
  iconUrl: string | null;
  crateSize: number;
  productionTime: number;
  isActive: boolean;
}

export interface CatalogItemDto {
  id: string;
  code: string;
  name: string;
  english_name: string;
  category: string;
  icon_url: string | null;
  crate_size: number;
  production_time: number;
  is_active: boolean;
}

export function toFoxholeItem(dto: CatalogItemDto): FoxholeItem {
  return {
    id: dto.id,
    code: dto.code,
    name: dto.name,
    englishName: dto.english_name,
    category: dto.category,
    iconUrl: dto.icon_url,
    crateSize: dto.crate_size,
    productionTime: dto.production_time,
    isActive: dto.is_active,
  };
}

export interface RecipeIngredient {
  itemId: string;
  quantity: number;
}

export interface CraftRecipe {
  itemId: string;
  facility: string;
  ingredients: RecipeIngredient[];
  yieldQuantity: number;
}
