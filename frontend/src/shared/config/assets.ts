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

/** Иконки интерфейса — линейный набор Tabler Icons (MIT), backend/static/ui/<name>.svg. */
export type UiIcon =
  | "orders" | "reports" | "timers" | "codes" | "tools" | "training" | "cabinet" | "guide"
  | "file-txt" | "file-xlsx" | "file-png" | "file-json" | "clipboard" | "document"
  | "search" | "stockpile" | "crates" | "factory" | "mpf" | "refinery" | "facility" | "pyramid"
  | "alarm" | "truck" | "map" | "terminal";

export function uiIcon(name: UiIcon): string {
  return `${env.apiUrl}/api/v1/assets/ui/${name}.svg`;
}

// Старые PNG-иконки (пути в уже сохранённом контенте БД) -> новый набор.
const LEGACY_UI: Record<string, UiIcon> = {
  "24-hour-clock": "timers", clock: "timers", stopwatch: "timers", second: "timers", deadline: "alarm",
  browsing: "terminal", json: "file-json", "txt-file": "file-txt", xls: "file-xlsx", "png-file": "file-png",
  "log-file": "reports", parchment: "document", pallets: "crates", parcel: "crates", products: "crates",
  barracks: "stockpile", "military-base": "stockpile", business: "factory", "conveyor-belt": "mpf",
  forklift: "truck", "pre-forklift": "truck", "delivery-van": "truck", ecommerce: "crates", find: "search",
  brain: "training", braces: "codes",
};

/** Путь /api/v1/assets/ui/<name>.(png|svg) из контента -> иконка набора (или null для прочих картинок). */
export function uiIconFromAsset(path: string | null | undefined): UiIcon | null {
  const m = path?.match(/\/assets\/ui\/([\w-]+)\.(?:png|svg)$/);
  if (!m) return null;
  return LEGACY_UI[m[1]] ?? (m[1] as UiIcon);
}
