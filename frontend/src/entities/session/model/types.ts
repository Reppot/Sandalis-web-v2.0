export type ClanRole = "owner" | "admin" | "officer" | "member" | "guest";
export type SubjectType = "user" | "clan_token" | "guest";

/** Зеркало backend `MeRead`. */
export interface UserSession {
  subjectType: SubjectType;
  userId: string;
  clanId: string;
  role: ClanRole;
  scopes: string[];
  displayName: string | null;
  avatarUrl: string | null;
  /** Язык интерфейса из профиля (users.preferred_locale). */
  locale: string | null;
}

export interface MeReadDto {
  subject_type: SubjectType;
  user_id: string;
  clan_id: string;
  role: ClanRole;
  scopes: string[];
  display_name: string | null;
  avatar_url?: string | null;
  locale?: string | null;
}

export interface TokenResponseDto {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  me: MeReadDto;
  message: string;
}

export function toUserSession(dto: MeReadDto): UserSession {
  return {
    subjectType: dto.subject_type,
    userId: dto.user_id,
    clanId: dto.clan_id,
    role: dto.role,
    scopes: dto.scopes,
    displayName: dto.display_name,
    avatarUrl: dto.avatar_url ?? null,
    locale: dto.locale ?? null,
  };
}

/** Зеркало backend `app/core/permissions.py`: одно право — одно действие. */
export const Scopes = {
  STOCKPILES_READ: "stockpiles:read",
  STOCKPILES_CREATE: "stockpiles:create",
  STOCKPILES_EDIT: "stockpiles:edit",
  STOCKPILES_DELETE: "stockpiles:delete",
  STOCKPILES_ITEMS: "stockpiles:items",
  STOCKPILES_PYRAMID: "stockpiles:pyramid",
  REPORTS_READ: "reports:read",
  REPORTS_CREATE: "reports:create",
  REPORTS_STATUS: "reports:status",
  REPORTS_EDIT: "reports:edit",
  REPORTS_DELETE: "reports:delete",
  REPORTS_DISCORD: "reports:discord",
  REPORTS_PROGRESS: "reports:progress",
  TIMERS_READ: "timers:read",
  TIMERS_CREATE: "timers:create",
  TIMERS_UPDATE: "timers:update",
  TIMERS_LOG: "timers:log",
  TIMERS_DELETE: "timers:delete",
  CATALOG_READ: "catalog:read",
  CLAN_WEBHOOK: "clan:webhook",
  CLAN_TOKENS: "clan:tokens",
  CLAN_CONTENT: "clan:content",
} as const;

export type Scope = (typeof Scopes)[keyof typeof Scopes];

function scopeMatches(granted: string, required: string): boolean {
  if (granted === "*" || granted === required) return true;
  if (granted.endsWith(":*")) return required.startsWith(granted.slice(0, -1));
  return false;
}

/** Та же семантика, что `has_scope` на бэкенде (owner = "*", "orders:*"). */
/** Проверка прав, которую страница передаёт вкладкам. */
export type Can = (...required: Scope[]) => boolean;

export function hasScope(session: UserSession | null, ...required: Scope[]): boolean {
  if (!session) return false;
  return required.every((r) => session.scopes.some((g) => scopeMatches(g, r)));
}
