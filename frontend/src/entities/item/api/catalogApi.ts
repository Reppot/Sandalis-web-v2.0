import { apiClient } from "@/shared";
import type { Page } from "@/shared";
import {
  toFoxholeItem,
  type CatalogItemDto,
  type FoxholeItem,
  type ItemUnit,
  type ParseResult,
  type ScanResult,
} from "@/entities/item/model/types";

export interface CatalogSearch {
  query?: string;
  category?: string;
  faction?: string;
  needsReview?: boolean;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface CatalogPage {
  items: FoxholeItem[];
  total: number;
}

interface ParsedLineDto {
  name: string;
  count: number;
  unit: ItemUnit;
  item: CatalogItemDto | null;
}
interface ParseResultDto {
  lines: ParsedLineDto[];
  matched: number;
  unknown: string[];
}
interface ScanResultDto extends ParseResultDto {
  file_name: string;
  file_size: number;
  strict: boolean;
}

const toParseResult = (dto: ParseResultDto): ParseResult => ({
  matched: dto.matched,
  unknown: dto.unknown,
  lines: dto.lines.map((l) => ({ ...l, item: l.item ? toFoxholeItem(l.item) : null })),
});

/** Глобальный каталог: поиск, разбор отчётов сканера и MapData.sav — всё на сервере. */
export const catalogApi = {
  async search({ query = "", category, faction, needsReview, activeOnly, limit = 50, offset = 0 }: CatalogSearch = {}): Promise<CatalogPage> {
    const page = await apiClient.get<Page<CatalogItemDto>>("/api/v1/items", {
      params: { query, category, faction, needs_review: needsReview, active_only: activeOnly, limit, offset },
    });
    return { total: page.total, items: page.items.map(toFoxholeItem) };
  },

  /** Весь каталог (~400 позиций) постранично по 500 — для матрицы конструктора и базы кодов. */
  async all(): Promise<FoxholeItem[]> {
    const out: FoxholeItem[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await this.search({ limit: 500, offset, activeOnly: true });
      out.push(...page.items);
      if (out.length >= page.total || page.items.length === 0) return out;
    }
  },

  async parse(text: string): Promise<ParseResult> {
    return toParseResult(await apiClient.post<ParseResultDto>("/api/v1/items/parse", { text }));
  },

  async scan(file: File): Promise<ScanResult> {
    const form = new FormData();
    form.append("file", file);
    const dto = await apiClient.postForm<ScanResultDto>("/api/v1/items/scan", form);
    return { ...toParseResult(dto), fileName: dto.file_name, fileSize: dto.file_size, strict: dto.strict };
  },
};
