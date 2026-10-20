import type { MessageKey, UiIcon } from "@/shared";

export type TabKey = "orders" | "reports" | "timers" | "codes" | "tools" | "training" | "cabinet";

export interface NavTab {
  key: TabKey;
  icon: UiIcon;
  /** Ключ фона раздела в реестре медиа (bg_<ключ>). */
  background: string;
}

export const TABS: NavTab[] = [
  { key: "orders", icon: "parchment", background: "orders" },
  { key: "reports", icon: "log-file", background: "reports" },
  { key: "timers", icon: "24-hour-clock", background: "timers" },
  { key: "codes", icon: "braces", background: "codes" },
  { key: "tools", icon: "browsing", background: "tools" },
  { key: "training", icon: "brain", background: "training" },
  { key: "cabinet", icon: "business", background: "cabinet" },
];

/** Подписи вкладки в словаре: nav.<key>.label / .short / .hint. */
export const tabKeys = (key: TabKey) => ({
  label: `nav.${key}.label` as MessageKey,
  short: `nav.${key}.short` as MessageKey,
  hint: `nav.${key}.hint` as MessageKey,
});

export function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}
