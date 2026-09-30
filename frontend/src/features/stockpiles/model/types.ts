import type { Stockpile } from "@/entities/stockpile";

export interface CreateStockpileFormData {
  name: string;
  location: string;
  code?: string;
}