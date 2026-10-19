import type { UiIcon } from "@/shared";

export type TabKey = "orders" | "reports" | "timers" | "codes" | "tools" | "training" | "cabinet";

export interface NavTab {
  key: TabKey;
  label: string;
  short: string;
  icon: UiIcon;
  hint: string;
  /** Ключ фона раздела в реестре медиа (bg_<ключ>). */
  background: string;
}

export const TABS: NavTab[] = [
  { key: "orders", label: "Заказы", short: "Заказы", icon: "parchment", hint: "Конструктор заказов и монитор склада", background: "orders" },
  { key: "reports", label: "Текущие заказы клана", short: "Рапорты", icon: "log-file", hint: "Рапорты снабжения: статусы, экспорт, Discord", background: "reports" },
  { key: "timers", label: "Таймеры", short: "Таймеры", icon: "24-hour-clock", hint: "Таймеры деспавна складов", background: "timers" },
  { key: "codes", label: "База кодов", short: "Коды", icon: "braces", hint: "Реестр кодов предметов Foxhole", background: "codes" },
  { key: "tools", label: "Инструменты", short: "Утилиты", icon: "browsing", hint: "Калькуляторы клана и внешние сервисы", background: "tools" },
  { key: "training", label: "Обучение", short: "Обучение", icon: "brain", hint: "Учебный центр штаба", background: "training" },
  { key: "cabinet", label: "Личный кабинет", short: "Кабинет", icon: "business", hint: "Профиль участника и управление кланом", background: "cabinet" },
];

export function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}
