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

/** Зеркало backend `app/core/permissions.py`. */
export const Scopes = {
  ORDERS_READ: "orders:read",
  ORDERS_WRITE: "orders:write",
  ORDERS_DELETE: "orders:delete",
  STOCKPILES_READ: "stockpiles:read",
  STOCKPILES_WRITE: "stockpiles:write",
  TIMERS_READ: "timers:read",
  TIMERS_WRITE: "timers:write",
  CATALOG_READ: "catalog:read",
  CLAN_MEMBERS_READ: "clan:members:read",
  CLAN_MEMBERS_WRITE: "clan:members:write",
  CLAN_SETTINGS_WRITE: "clan:settings:write",
} as const;

export type Scope = (typeof Scopes)[keyof typeof Scopes];

function scopeMatches(granted: string, required: string): boolean {
  if (granted === "*" || granted === required) return true;
  if (granted.endsWith(":*")) return required.startsWith(granted.slice(0, -1));
  return false;
}

/** Та же семантика, что `has_scope` на бэкенде (owner = "*", "orders:*"). */
export function hasScope(session: UserSession | null, ...required: Scope[]): boolean {
  if (!session) return false;
  return required.every((r) => session.scopes.some((g) => scopeMatches(g, r)));
}
