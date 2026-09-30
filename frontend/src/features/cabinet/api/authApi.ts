import { apiClient } from "@/shared";
import type { UserSession } from "@/entities/session";

export const authApi = {
  async getMe(): Promise<UserSession> {
    return apiClient.get<UserSession>("/api/v1/auth/me");
  },

  async loginWithToken(token: string): Promise<UserSession> {
    return apiClient.post<UserSession>("/api/v1/auth/token", { token });
  },

  async logout(): Promise<void> {
    return apiClient.post<void>("/api/v1/auth/logout");
  },
};