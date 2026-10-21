import { apiClient } from "@/shared";

/** Профиль клана для раздела «Ваш клан» (GET /api/v1/clan/profile). */
export interface ClanProfile {
  id: string;
  name: string;
  /** Аватар Discord-сервера клана. */
  icon_url: string | null;
  has_discord: boolean;
  members: number;
  stockpiles: number;
}

export const clanApi = {
  profile: () => apiClient.get<ClanProfile>("/api/v1/clan/profile"),
};
