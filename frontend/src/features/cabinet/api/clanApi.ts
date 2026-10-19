import { apiClient } from "@/shared";
import type { CreatedInviteEnvelope, Page } from "@/shared";
import type { ClanRole } from "@/entities/session";

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
