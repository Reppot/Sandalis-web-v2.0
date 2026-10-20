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
  async members(): Promise<{ status: "ok" | "no_bot" | "intent_required" | "no_guild"; members: ClanMember[] }> {
    const r = await apiClient.get<{ status: "ok" | "no_bot" | "intent_required" | "no_guild"; members: MemberDto[] }>("/api/v1/clan/members");
    return {
      status: r.status,
      members: r.members.map((m) => ({ id: m.id, name: m.name, roles: m.roles, level: m.level, inDiscord: m.in_discord, joined: m.joined, role: m.role, permissions: m.permissions })),
    };
  },
  permissions(): Promise<PermissionCatalog> {
    return apiClient.get<PermissionCatalog>("/api/v1/clan/permissions");
  },
};
