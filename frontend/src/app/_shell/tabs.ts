import type { Scope } from "@/entities/session";
import type { MessageKey, UiIcon } from "@/shared";

export type TabKey = "tools" | "clan" | "guide" | "cabinet";

export interface NavTab {
  key: TabKey;
  icon: UiIcon;
  /** Ключ фона раздела в реестре медиа (bg_<ключ>). */
  background: string;
  /** Вкладка видна, только если есть хотя бы одно из прав (данные клана). */
  anyOf?: Scope[];
  /** Только участникам клана (не гостю). */
  membersOnly?: boolean;
}

export const TABS: NavTab[] = [
  { key: "tools", icon: "tools", background: "tools" },
  { key: "clan", icon: "cabinet", background: "reports", membersOnly: true },   // «Ваш клан»
  { key: "guide", icon: "guide", background: "training" },
  { key: "cabinet", icon: "cabinet", background: "cabinet" },   // «Настройки»
];

/** Разделы на боковой панели; все разделы (и они тоже) — в бургер-меню. */
export const SIDEBAR_KEYS: TabKey[] = ["tools", "clan", "guide"];

/** Подписи вкладки в словаре: nav.<key>.label / .short / .hint. */
export const tabKeys = (key: TabKey) => ({
  label: `nav.${key}.label` as MessageKey,
  short: `nav.${key}.short` as MessageKey,
  hint: `nav.${key}.hint` as MessageKey,
});

/** Вкладки, доступные сессии: гостю — инструменты, навигация и настройки. */
export function visibleTabs(can: (...scopes: Scope[]) => boolean, isGuest = false): NavTab[] {
  return TABS.filter((tab) => (tab.membersOnly ? !isGuest : !tab.anyOf || tab.anyOf.some((scope) => can(scope))));
}

export function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}

/** Модули «Инструментов», которые раньше были отдельными вкладками (старые ссылки ?tab=orders). */
export const TOOL_MODULES = ["orders", "pyramid", "codes"] as const;
export type ToolModuleKey = (typeof TOOL_MODULES)[number];
export const isToolModule = (value: string | null): value is ToolModuleKey => TOOL_MODULES.includes(value as ToolModuleKey);

/** Подразделы «Вашего клана»; старые ссылки ?tab=reports / timers / training / management ведут сюда. */
export const CLAN_VIEWS = ["reports", "stockpiles", "training", "management"] as const;
export type ClanView = (typeof CLAN_VIEWS)[number];
const LEGACY_CLAN: Record<string, ClanView> = { reports: "reports", timers: "stockpiles", training: "training", management: "management" };
export const legacyClanView = (value: string | null): ClanView | null => (value ? LEGACY_CLAN[value] ?? null : null);
export const isClanView = (value: string | null): value is ClanView => CLAN_VIEWS.includes(value as ClanView);
