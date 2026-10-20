import { apiClient } from "@/shared";
import type { CreatedInviteEnvelope, Page } from "@/shared";
import type { ClanRole } from "@/entities/session";
import type { AccessLevel } from "@/features/cabinet/api/authApi";

export type GrantableRole = Extract<ClanRole, "guest" | "member" | "officer">;

export interface InviteCodeDto {
  id: string;
  code: string;
  role: ClanRole;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
}

export interface InviteCode {
  id: string;
  code: string;
  role: ClanRole;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ClanApiTokenCreated {
  id: string;
  label: string;
  role: ClanRole;
  expires_at: string | null;
  raw_token: string;
  message: string;
}

function toInvite(dto: InviteCodeDto): InviteCode {
  return {
    id: dto.id,
    code: dto.code,
    role: dto.role,
    maxUses: dto.max_uses,
    usedCount: dto.used_count,
    expiresAt: dto.expires_at,
    revokedAt: dto.revoked_at,
    createdBy: dto.created_by,
    createdAt: dto.created_at,
  };
}

export const clanApi = {
  async listInvites(includeRevoked = false): Promise<InviteCode[]> {
    const page = await apiClient.get<Page<InviteCodeDto>>("/api/v1/auth/invites", {
      params: { include_revoked: includeRevoked, limit: 200, offset: 0 },
    });
    return page.items.map(toInvite);
  },

  async createInvite(input: {
    role: GrantableRole;
    maxUses: number;
    expiresInHours: number | null;
  }): Promise<{ invite: InviteCode; message: string }> {
    const created = await apiClient.post<CreatedInviteEnvelope<InviteCodeDto>>("/api/v1/auth/invites", {
      role: input.role,
      max_uses: input.maxUses,
      expires_in_hours: input.expiresInHours,
    });
    return { invite: toInvite(created.invite), message: created.message };
  },

  async revokeInvite(id: string): Promise<void> {
    await apiClient.delete<void>(`/api/v1/auth/invites/${id}`);
  },

  /** Клановый токен для ботов (X-Clan-Token). raw_token показывается один раз. */
  async createClanToken(input: {
    label: string;
    role: ClanRole;
    expiresInHours: number | null;
  }): Promise<ClanApiTokenCreated> {
    return apiClient.post<ClanApiTokenCreated>("/api/v1/auth/clan-token", {
      label: input.label,
      role: input.role,
      expires_in_hours: input.expiresInHours,
    });
  },
};

export interface ClanSettings {
  discord_webhook_configured: boolean;
  discord_webhook_hint: string | null;
}

export const clanSettingsApi = {
  get(): Promise<ClanSettings> {
    return apiClient.get<ClanSettings>("/api/v1/clan/settings");
  },
  /** null или "" — отключить отправку рапортов в Discord. */
  setWebhook(url: string | null): Promise<{ settings: ClanSettings; message: string }> {
    return apiClient.put("/api/v1/clan/settings", { discord_webhook_url: url || null });
  },
};

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
  level: AccessLevel;
}

export interface DiscordRoles {
  guildId: string | null;
  botConfigured: boolean;
  botInGuild: boolean;
  botInviteUrl: string | null;
  syncedAt: string | null;
  roles: DiscordRole[];
}

export interface DiscordMember {
  id: string;
  name: string;
  roles: string[];
  level: AccessLevel;
  joined: boolean;
  role: ClanRole | null;
}

interface DiscordRolesDto {
  guild_id: string | null;
  bot_configured: boolean;
  bot_in_guild: boolean;
  bot_invite_url: string | null;
  synced_at: string | null;
  roles: DiscordRole[];
}

const toDiscordRoles = (d: DiscordRolesDto): DiscordRoles => ({
  guildId: d.guild_id,
  botConfigured: d.bot_configured,
  botInGuild: d.bot_in_guild,
  botInviteUrl: d.bot_invite_url,
  syncedAt: d.synced_at,
  roles: d.roles,
});

type Saved = { roles: DiscordRolesDto; message: string };

/** «Роли Discord» — только командир клана. */
export const discordRolesApi = {
  async get(): Promise<DiscordRoles> {
    return toDiscordRoles(await apiClient.get<DiscordRolesDto>("/api/v1/clan/discord-roles"));
  },
  async pull(): Promise<{ roles: DiscordRoles; message: string }> {
    const r = await apiClient.post<Saved>("/api/v1/clan/discord-roles/pull");
    return { roles: toDiscordRoles(r.roles), message: r.message };
  },
  async save(levels: Record<string, AccessLevel>): Promise<{ roles: DiscordRoles; message: string }> {
    const r = await apiClient.put<Saved>("/api/v1/clan/discord-roles", { levels });
    return { roles: toDiscordRoles(r.roles), message: r.message };
  },
  async members(): Promise<{ status: "ok" | "no_bot" | "intent_required" | "no_guild"; members: DiscordMember[] }> {
    return apiClient.get("/api/v1/clan/discord-members");
  },
};
