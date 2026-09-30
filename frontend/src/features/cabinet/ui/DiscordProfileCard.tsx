import * as React from "react";
import type { UserSession } from "@/entities/session";
import { Card, Button } from "@/shared";
import { LogOut, ShieldCheck, User } from "lucide-react";

interface DiscordProfileCardProps {
  session: UserSession;
  onLogout: () => void;
}

export const DiscordProfileCard: React.FC<DiscordProfileCardProps> = ({ session, onLogout }) => {
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-sindaris-border">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-green-400" />
          <h3 className="font-bold text-base text-sindaris-text">АВТОРИЗАЦИЯ АКТИВНА</h3>
        </div>
        <span className="text-xs uppercase bg-sindaris-accent/20 text-sindaris-accent font-bold px-2 py-0.5 rounded-sm">
          {session.role}
        </span>
      </div>

      <div className="flex items-center gap-4 py-2">
        <div className="h-12 w-12 rounded-full bg-sindaris-bg border border-sindaris-border flex items-center justify-center overflow-hidden">
          {session.discordProfile?.avatarUrl ? (
            <img
              src={session.discordProfile.avatarUrl}
              alt="Avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            <User className="h-6 w-6 text-sindaris-muted" />
          )}
        </div>

        <div className="space-y-0.5">
          <p className="font-bold text-sm text-sindaris-text">
            {session.discordProfile?.username ?? "Боец клана"}
          </p>
          <p className="text-xs text-sindaris-muted font-mono">
            ID: {session.discordId ?? "Token-session"}
          </p>
        </div>
      </div>

      <div className="pt-2">
        <Button variant="danger" size="sm" onClick={onLogout} className="w-full">
          <LogOut className="h-3.5 w-3.5 mr-2" /> Завершить сессию
        </Button>
      </div>
    </Card>
  );
};