"use client";

import * as React from "react";
import { hasScope, type Scope, type UserSession } from "@/entities/session";
import { ApiError, setUnauthorizedHandler } from "@/shared";
import { authApi } from "@/features/cabinet/api/authApi";

interface SessionContextValue {
  session: UserSession | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setSession: (session: UserSession | null) => void;
  logout: () => Promise<void>;
  can: (...scopes: Scope[]) => boolean;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export const SessionProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [session, setSession] = React.useState<UserSession | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const data = await authApi.getMe();
      setSession(data);
      setError(null);
    } catch (err) {
      setSession(null);
      if (err instanceof ApiError && err.status !== 401) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // кука истекла посреди работы — показываем экран входа вместо ошибок вкладок
    setUnauthorizedHandler(() => setSession(null));
    void refresh();
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  const logout = React.useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setSession(null);
    }
  }, []);

  const can = React.useCallback((...scopes: Scope[]) => hasScope(session, ...scopes), [session]);

  const value = React.useMemo(
    () => ({ session, loading, error, refresh, setSession, logout, can }),
    [session, loading, error, refresh, logout, can]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export function useSession(): SessionContextValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}
