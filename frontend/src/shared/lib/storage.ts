/**
 * localStorage только для удобств одного браузера (тема, свёрнутое меню, черновик
 * конструктора). Приватный режим/запрет хранилища не ломает интерфейс.
 */
export const STORAGE_KEYS = {
  theme: "sindaris-theme",
  sidebar: "sindaris-sidebar",
  orderDraft: "sindaris-order-draft",
  pinnedStockpile: "sindaris-pinned-stockpile",
} as const;

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStorage(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // приватный режим браузера — состояние живёт только в памяти
  }
}
