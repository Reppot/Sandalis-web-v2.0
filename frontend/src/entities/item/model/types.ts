export type ItemUnit = "crate" | "unit";

export interface FoxholeItem {
  code: string;
  name: string;
  englishName: string;
  category: string;
  faction: string;
  origin: string | null;
  iconUrl: string | null;
  crateSize: number;
  productionTime: number;
  isActive: boolean;
  aliases: string[];
  needsReview: boolean;
}

export interface CatalogItemDto {
  id: string;
  code: string;
  name: string;
  english_name: string;
  category: string;
  faction?: string;
  origin?: string | null;
  icon_url: string | null;
  crate_size: number;
  production_time: number;
  is_active: boolean;
  aliases?: string[];
  needs_review?: boolean;
}

export function toFoxholeItem(dto: CatalogItemDto): FoxholeItem {
  return {
    code: dto.code,
    name: dto.name,
    englishName: dto.english_name,
    category: dto.category,
    faction: dto.faction ?? "neutral",
    origin: dto.origin ?? null,
    iconUrl: dto.icon_url,
    crateSize: dto.crate_size,
    productionTime: dto.production_time,
    isActive: dto.is_active,
    aliases: dto.aliases ?? [],
    needsReview: dto.needs_review ?? false,
  };
}

/** Строка отчёта сканера, разобранная сервером (POST /items/parse, /items/scan). */
export interface ParsedLine {
  name: string;
  count: number;
  unit: ItemUnit;
  item: FoxholeItem | null;
}

export interface ParseResult {
  lines: ParsedLine[];
  matched: number;
  unknown: string[];
}

export interface ScanResult extends ParseResult {
  fileName: string;
  fileSize: number;
  strict: boolean;
}

/** Название предмета на языке интерфейса: в игре есть русское и английское, чешского нет. */
export function itemName(item: Pick<FoxholeItem, "name" | "englishName">, locale: string): string {
  return locale === "ru" ? item.name : item.englishName || item.name;
}
