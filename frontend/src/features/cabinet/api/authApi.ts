import { apiClient, env } from "@/shared";
import {
  toUserSession,
  type ClanRole,
  type MeReadDto,
  type TokenResponseDto,
  type UserSession,
} from "@/entities/session";

// Сессия целиком в HttpOnly-куке, которую ставит API (Discord callback,
// выбор сервера, гостевой вход, dev-token). Фронт токен не хранит и Bearer не шлёт.

/** Сервер Discord, которым владеет пользователь (выбор сервера клана). */
export interface SetupGuild {
  id: string;
  name: string;
  iconUrl: string | null;
  /** Сервер уже привязан к клану терминала. */
  clanId: string | null;
  clanName: string | null;
}

export interface SetupMembership {
  clanId: string;
  clanName: string;
  role: ClanRole;
}

export interface DiscordSetup {
  displayName: string;
  avatarUrl: string | null;
  guilds: SetupGuild[];
  memberships: SetupMembership[];
}

export interface InvitePreview {
  code: string;
  clanName: string;
  clanIconUrl: string | null;
  role: ClanRole;
}

interface DiscordSetupDto {
  display_name: string;
  avatar_url: string | null;
  guilds: { id: string; name: string; icon_url: string | null; clan_id: string | null; clan_name: string | null }[];
  memberships: { clan_id: string; clan_name: string; role: ClanRole }[];
}

export const authApi = {
  discordLoginUrl(options: { returnTo?: string; invite?: string | null } = {}): string {
    const params = new URLSearchParams({ return_to: options.returnTo ?? "/" });
    if (options.invite) params.set("invite", options.invite);
    return `${env.apiUrl}/api/v1/auth/discord/login?${params.toString()}`;
  },

  /** Ссылка-приглашение: после Discord-входа пользователь вступает в клан с ролью кода. */
  inviteLink(code: string): string {
    return `${window.location.origin}/?invite=${encodeURIComponent(code)}`;
  },

  async previewInvite(code: string): Promise<InvitePreview> {
    const dto = await apiClient.get<{ code: string; clan_name: string; clan_icon_url: string | null; role: ClanRole }>(
      `/api/v1/auth/invites/${encodeURIComponent(code)}/preview`,
    );
    return { code: dto.code, clanName: dto.clan_name, clanIconUrl: dto.clan_icon_url, role: dto.role };
  },

  /** Незавершённый Discord-вход владельца серверов (кука живёт ~15 минут). */
  async getSetup(): Promise<DiscordSetup> {
    const dto = await apiClient.get<DiscordSetupDto>("/api/v1/auth/discord/setup");
    return {
      displayName: dto.display_name,
      avatarUrl: dto.avatar_url,
      guilds: dto.guilds.map((g) => ({ id: g.id, name: g.name, iconUrl: g.icon_url, clanId: g.clan_id, clanName: g.clan_name })),
      memberships: dto.memberships.map((m) => ({ clanId: m.clan_id, clanName: m.clan_name, role: m.role })),
    };
  },

  /** Выбрать сервер клана (станете командиром) или клан, где уже состоите. */
  async completeSetup(choice: { guildId: string } | { clanId: string }): Promise<UserSession> {
    await apiClient.post<TokenResponseDto>(
      "/api/v1/auth/discord/setup",
      "guildId" in choice ? { guild_id: choice.guildId } : { clan_id: choice.clanId },
    );
    return this.getMe();
  },

  async loginAsGuest(): Promise<UserSession> {
    await apiClient.post<TokenResponseDto>("/api/v1/auth/guest");
    return this.getMe();
  },

  async getMe(): Promise<UserSession> {
    const dto = await apiClient.get<MeReadDto>("/api/v1/auth/me");
    return toUserSession(dto);
  },

  /** Язык интерфейса в профиле — тот же выбор на других устройствах и в десктоп-клиенте. */
  async setLocale(locale: string): Promise<void> {
    await apiClient.put<MeReadDto>("/api/v1/auth/me/locale", { locale });
  },

  async logout(): Promise<void> {
    await apiClient.post<void>("/api/v1/auth/logout");
  },

  async loginWithDevToken(input: {
    userId: string;
    clanId: string;
    role?: UserSession["role"];
    displayName?: string;
  }): Promise<UserSession> {
    await apiClient.post<TokenResponseDto>("/api/v1/auth/dev-token", {
      user_id: input.userId,
      clan_id: input.clanId,
      role: input.role ?? "member",
      display_name: input.displayName ?? input.userId,
      upsert: true,
    });
    return this.getMe();
  },
};
