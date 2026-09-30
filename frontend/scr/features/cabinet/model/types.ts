import type { UserSession } from "@/entities/session";

export interface CabinetState {
  session: UserSession | null;
  isLoading: boolean;
  error: string | null;
}