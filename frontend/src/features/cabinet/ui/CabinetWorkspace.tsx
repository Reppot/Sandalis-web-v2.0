"use client";

import * as React from "react";
import { Spinner } from "@/shared";
import { useSession } from "@/features/cabinet/model/session-context";
import { DiscordProfileCard } from "@/features/cabinet/ui/DiscordProfileCard";
import { TokenLoginForm } from "@/features/cabinet/ui/TokenLoginForm";
import { InvitesPanel } from "@/features/cabinet/ui/InvitesPanel";
import { ClanTokenPanel } from "@/features/cabinet/ui/ClanTokenPanel";
import { Scopes } from "@/entities/session";

export const CabinetWorkspace: React.FC = () => {
  const { session, loading, error, setSession, logout, can } = useSession();

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

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {session ? (
        <div className="space-y-6">
          <div className="max-w-md mx-auto">
            <DiscordProfileCard session={session} onLogout={() => void logout()} />
          </div>
          {can(Scopes.CLAN_MEMBERS_READ) && (
            <InvitesPanel canManage={can(Scopes.CLAN_MEMBERS_WRITE)} />
          )}
          {can(Scopes.CLAN_SETTINGS_WRITE) && <ClanTokenPanel />}
        </div>
      ) : (
        <TokenLoginForm onLoggedIn={setSession} />
      )}
    </div>
  );
};
