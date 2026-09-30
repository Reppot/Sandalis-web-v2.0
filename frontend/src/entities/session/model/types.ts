export interface DiscordProfile {
  id: string;
  username: string;
  discriminator: string;
  avatarUrl: string | null;
}

export interface UserSession {
  token: string;
  discordId: string | null;
  discordProfile: DiscordProfile | null;
  createdAt: string;
  expiresAt: string;
  role: "admin" | "member" | "guest";
}