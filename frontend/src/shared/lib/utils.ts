import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Безопасное слияние классов Tailwind CSS с авторазрешением конфликтов.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Цвет роли Discord, читаемый на тёмном фоне: тёмные цвета осветляются. */
export function roleColor(color: number): string {
  if (!color) return "rgba(229,231,235,0.8)";
  let r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luma < 110) {
    const k = (110 - luma) / (255 - luma) + 0.25;      // подмешиваем белый
    r = Math.round(r + (255 - r) * k); g = Math.round(g + (255 - g) * k); b = Math.round(b + (255 - b) * k);
  }
  return `rgb(${r}, ${g}, ${b})`;
}