import { Scopes, type Scope } from "@/entities/session";
import type { MessageKey, UiIcon } from "@/shared";

export type TabKey = "orders" | "reports" | "timers" | "codes" | "tools" | "training" | "guide" | "management" | "cabinet";

export interface NavTab {
  key: TabKey;
  icon: UiIcon;
  /** Ключ фона раздела в реестре медиа (bg_<ключ>). */
  background: string;
  /** Вкладка видна, только если есть хотя бы одно из прав (данные клана). */
  anyOf?: Scope[];
  /** Только командир клана (владелец Discord-сервера). */
  ownerOnly?: boolean;
}

export const TABS: NavTab[] = [
  { key: "orders", icon: "orders", background: "orders", anyOf: [Scopes.STOCKPILES_READ, Scopes.REPORTS_CREATE] },
  { key: "reports", icon: "reports", background: "reports", anyOf: [Scopes.REPORTS_READ] },
  { key: "timers", icon: "timers", background: "timers", anyOf: [Scopes.TIMERS_READ] },
  { key: "codes", icon: "codes", background: "codes" },
  { key: "tools", icon: "tools", background: "tools" },
  { key: "training", icon: "training", background: "training" },
  { key: "guide", icon: "guide", background: "training" },
  { key: "management", icon: "map", background: "cabinet", ownerOnly: true },
  { key: "cabinet", icon: "cabinet", background: "cabinet" },
];

/** Подписи вкладки в словаре: nav.<key>.label / .short / .hint. */
export const tabKeys = (key: TabKey) => ({
  label: `nav.${key}.label` as MessageKey,
  short: `nav.${key}.short` as MessageKey,
  hint: `nav.${key}.hint` as MessageKey,
});

/** Вкладки, доступные сессии: гость видит только инструменты, коды, обучение и кабинет. */
export function visibleTabs(can: (...scopes: Scope[]) => boolean, isOwner = false): NavTab[] {
  return TABS.filter((tab) => (tab.ownerOnly ? isOwner : !tab.anyOf || tab.anyOf.some((scope) => can(scope))));
}

export function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}
