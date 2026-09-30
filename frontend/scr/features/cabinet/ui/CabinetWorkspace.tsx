"use client";

import * as React from "react";
import type { UserSession } from "@/entities/session";
import { Spinner } from "@/shared";
import { authApi } from "@/features/cabinet/api/authApi";
import { DiscordProfileCard } from "@/features/cabinet/ui/DiscordProfileCard";
import { TokenLoginForm } from "@/features/cabinet/ui/TokenLoginForm";

export const CabinetWorkspace: React.FC = () => {
  const [session, setSession] = React.useState<UserSession | null>(null);
  const [loading, setLoading] = React.useState(true);

  const checkSession = React.useCallback(async () => {
    try {
      const data = await authApi.getMe();
      setSession(data);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    checkSession();
  }, [checkSession]);

  const handleLogin = async (token: string) => {
    const newSession = await authApi.loginWithToken(token);
    setSession(newSession);
  };

  const handleLogout = async () => {
    await authApi.logout();
    setSession(null);
  };

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-sindaris-border">
        <h2 className="text-xl font-bold text-sindaris-accent tracking-wide">ЛИЧНЫЙ КАБИНЕТ</h2>
        <p className="text-xs text-sindaris-muted">Статус доступа, сессия и привязка аккаунта</p>
      </div>

      {session ? (
        <div className="max-w-md mx-auto">
          <DiscordProfileCard session={session} onLogout={handleLogout} />
        </div>
      ) : (
        <TokenLoginForm onLogin={handleLogin} />
      )}
    </div>
  );
};