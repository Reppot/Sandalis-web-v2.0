import { env } from "@/shared/config/env";

/**
 * Файлы интерфейса раздаёт бэкенд (/api/v1/assets, backend/static) — фронт не держит
 * статику. Ссылки на иконки предметов и медиа приходят из БД готовыми путями;
 * здесь — только хром интерфейса (кнопки экспорта, навигация).
 */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${env.apiUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export type UiIcon =
  | "24-hour-clock" | "barracks" | "braces" | "brain" | "browsing" | "business" | "clock"
  | "conveyor-belt" | "deadline" | "delivery-van" | "ecommerce" | "find" | "forklift" | "json"
  | "log-file" | "military-base" | "pallets" | "parcel" | "parchment" | "png-file"
  | "pre-forklift" | "products" | "second" | "stopwatch" | "txt-file" | "xls";

export function uiIcon(name: UiIcon): string {
  return `${env.apiUrl}/api/v1/assets/ui/${name}.png`;
}
