import { Scopes, type Scope } from "@/entities/session";
import type { MessageKey, UiIcon } from "@/shared";

export type TabKey = "orders" | "reports" | "timers" | "codes" | "tools" | "training" | "cabinet";

export interface NavTab {
  key: TabKey;
  icon: UiIcon;
  /** Ключ фона раздела в реестре медиа (bg_<ключ>). */
  background: string;
  /** Вкладка видна, только если есть хотя бы одно из прав (данные клана). */
  anyOf?: Scope[];
}

export const TABS: NavTab[] = [
  { key: "orders", icon: "parchment", background: "orders", anyOf: [Scopes.STOCKPILES_READ, Scopes.ORDERS_READ] },
  { key: "reports", icon: "log-file", background: "reports", anyOf: [Scopes.ORDERS_READ] },
  { key: "timers", icon: "24-hour-clock", background: "timers", anyOf: [Scopes.TIMERS_READ] },
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

/** Вкладки, доступные сессии: гость видит только инструменты, коды, обучение и кабинет. */
export function visibleTabs(can: (...scopes: Scope[]) => boolean): NavTab[] {
  return TABS.filter((tab) => !tab.anyOf || tab.anyOf.some((scope) => can(scope)));
}

export function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}
