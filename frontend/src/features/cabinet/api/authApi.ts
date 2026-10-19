import { apiClient, env } from "@/shared";
import {
  toUserSession,
  type MeReadDto,
  type TokenResponseDto,
  type UserSession,
} from "@/entities/session";

// Сессия целиком в HttpOnly-куке, которую ставит API (Discord callback,
// redeem-code, dev-token). Фронт токен не хранит и Bearer не шлёт.

const WEB_USER_ID_KEY = "sandalis_web_user_id";

/** Стабильный id браузера для входа по invite-коду: повторный redeem не плодит юзеров. */
function webUserId(): string {
  try {
    const saved = window.localStorage.getItem(WEB_USER_ID_KEY);
    if (saved) return saved;
    const fresh = `web:${crypto.randomUUID()}`;
    window.localStorage.setItem(WEB_USER_ID_KEY, fresh);
    return fresh;
  } catch {
    return `web:${crypto.randomUUID()}`;
  }
}

export const authApi = {
  discordLoginUrl(returnTo = "/?tab=cabinet"): string {
    const params = new URLSearchParams({ return_to: returnTo });
    return `${env.apiUrl}/api/v1/auth/discord/login?${params.toString()}`;
  },

  async getMe(): Promise<UserSession> {
    const dto = await apiClient.get<MeReadDto>("/api/v1/auth/me");
    return toUserSession(dto);
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

  async redeemInvite(input: { code: string; displayName: string }): Promise<UserSession> {
    await apiClient.post<TokenResponseDto>("/api/v1/auth/redeem-code", {
      code: input.code,
      user_id: webUserId(),
      display_name: input.displayName,
    });
    return this.getMe();
  },
};
