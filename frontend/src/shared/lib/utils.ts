import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Безопасное слияние классов Tailwind CSS с авторазрешением конфликтов.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}