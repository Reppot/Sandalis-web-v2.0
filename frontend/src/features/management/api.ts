import { apiClient } from "@/shared";
import type { ClanRole } from "@/entities/session";

/** Пресет доступа роли Discord или набор прав вручную. */
export type AccessLevel = "basic" | "medium" | "high" | "custom";

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
  level: AccessLevel;
  /** Для custom — выбранные права, для пресета — его права. */
  permissions: string[];
}

export interface DiscordRoles {
  guildId: string | null;
  botConfigured: boolean;
  botInGuild: boolean;
  botInviteUrl: string | null;
  syncedAt: string | null;
  roles: DiscordRole[];
}

export const MEMBERS_PAGE = 100;

export interface MembersPage {
  status: "ok" | "no_bot" | "intent_required" | "no_guild";
  members: ClanMember[];
  nextAfter: string | null;
  total: number | null;
  joinedTotal: number;
}

export interface ClanMember {
  id: string;
  name: string;
  roles: { name: string; color: number }[];
  level: AccessLevel | "owner" | "guest";
  inDiscord: boolean;
  joined: boolean;
  role: ClanRole | null;
  permissions: string[];
}

export interface PermissionCatalog {
  groups: { key: string; permissions: string[] }[];
  presets: Record<"basic" | "medium" | "high", string[]>;
}

interface DiscordRolesDto {
  guild_id: string | null;
  bot_configured: boolean;
  bot_in_guild: boolean;
  bot_invite_url: string | null;
  synced_at: string | null;
  roles: DiscordRole[];
}

interface MemberDto {
  id: string;
  name: string;
  roles: { name: string; color: number }[];
  level: ClanMember["level"];
  in_discord: boolean;
  joined: boolean;
  role: ClanRole | null;
  permissions: string[];
}

const toRoles = (d: DiscordRolesDto): DiscordRoles => ({
  guildId: d.guild_id,
  botConfigured: d.bot_configured,
  botInGuild: d.bot_in_guild,
  botInviteUrl: d.bot_invite_url,
  syncedAt: d.synced_at,
  roles: d.roles,
});

type Saved = { roles: DiscordRolesDto; message: string };

/** Вкладка «Управление» — только командир клана. */
export const managementApi = {
  async roles(): Promise<DiscordRoles> {
    return toRoles(await apiClient.get<DiscordRolesDto>("/api/v1/clan/discord-roles"));
  },
  async pull(): Promise<{ roles: DiscordRoles; message: string }> {
    const r = await apiClient.post<Saved>("/api/v1/clan/discord-roles/pull");
    return { roles: toRoles(r.roles), message: r.message };
  },
  async save(levels: Record<string, AccessLevel>, permissions: Record<string, string[]>): Promise<{ roles: DiscordRoles; message: string }> {
    const r = await apiClient.put<Saved>("/api/v1/clan/discord-roles", { levels, permissions });
    return { roles: toRoles(r.roles), message: r.message };
  },
  /** Страница участников: after — курсор предыдущей страницы, q — поиск Discord по нику. */
  async members(params: { after?: string; q?: string; limit?: number } = {}): Promise<MembersPage> {
    const r = await apiClient.get<{ status: MembersPage["status"]; members: MemberDto[]; next_after: string | null; total: number | null; joined_total: number }>(
      "/api/v1/clan/members",
      { params: { after: params.after ?? "", q: params.q ?? "", limit: params.limit ?? MEMBERS_PAGE } },
    );
    return {
      status: r.status,
      members: r.members.map((m) => ({ id: m.id, name: m.name, roles: m.roles, level: m.level, inDiscord: m.in_discord, joined: m.joined, role: m.role, permissions: m.permissions })),
      nextAfter: r.next_after,
      total: r.total,
      joinedTotal: r.joined_total,
    };
  },
  permissions(): Promise<PermissionCatalog> {
    return apiClient.get<PermissionCatalog>("/api/v1/clan/permissions");
  },
};

// --------------------------------------------------------------------------- //
// Интеграции клана: канал Discord для рапортов и API-токены для ботов
// --------------------------------------------------------------------------- //
export interface ClanApiTokenCreated {
  id: string;
  label: string;
  role: ClanRole;
  expires_at: string | null;
  raw_token: string;
  message: string;
}

export interface ClanWebhook {
  discord_webhook_configured: boolean;
  discord_webhook_hint: string | null;
}

export const integrationsApi = {
  /** Клановый токен для ботов (X-Clan-Token). raw_token показывается один раз. */
  createClanToken(input: { label: string; role: ClanRole; expiresInHours: number | null }): Promise<ClanApiTokenCreated> {
    return apiClient.post<ClanApiTokenCreated>("/api/v1/auth/clan-token", {
      label: input.label,
      role: input.role,
      expires_in_hours: input.expiresInHours,
    });
  },
  getWebhook(): Promise<ClanWebhook> {
    return apiClient.get<ClanWebhook>("/api/v1/clan/settings");
  },
  /** null или "" — отключить отправку рапортов в Discord. */
  setWebhook(url: string | null): Promise<{ settings: ClanWebhook; message: string }> {
    return apiClient.put("/api/v1/clan/settings", { discord_webhook_url: url || null });
  },
};
