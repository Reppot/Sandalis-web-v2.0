import * as React from "react";
import { Card, Input, Button, env } from "@/shared";
import { KeyRound } from "lucide-react";
import { authApi } from "@/features/cabinet/api/authApi";
import type { UserSession } from "@/entities/session";

interface TokenLoginFormProps {
  onLoggedIn: (session: UserSession) => void;
}

// Ключи = AppError.code, которые бэкенд кладёт в FRONTEND_URL?error=<code>
// (app/services/discord_oauth.py, app/core/errors.py).
const OAUTH_ERROR_HINTS: Record<string, string> = {
  forbidden: "Вы не состоите в клане. Вступите по invite-коду ниже или попросите офицера добавить вас.",
  state_invalid: "Сессия входа истекла. Нажмите «Войти через Discord» ещё раз.",
  exchange_failed: "Discord не подтвердил вход (отмена или неверный Redirect URI). Попробуйте ещё раз.",
  profile_failed: "Не удалось получить профиль Discord. Попробуйте позже.",
  disabled: "Вход через Discord не настроен на сервере.",
};

export const TokenLoginForm: React.FC<TokenLoginFormProps> = ({ onLoggedIn }) => {
  const [inviteCode, setInviteCode] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [devUserId, setDevUserId] = React.useState("dev-admin");
  const [devClanId, setDevClanId] = React.useState("SANDALIS");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (oauthError) {
      setError(OAUTH_ERROR_HINTS[oauthError] ?? `Ошибка входа: ${oauthError}`);
      // убираем ?error из адреса, чтобы ошибка не всплывала после перезагрузки
      params.delete("error");
      params.set("tab", "cabinet");
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    }
  }, []);

  const handleDiscord = () => {
    window.location.assign(authApi.discordLoginUrl());
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim() || !displayName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const session = await authApi.redeemInvite({
        code: inviteCode.trim(),
        displayName: displayName.trim(),
      });
      onLoggedIn(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось принять код");
    } finally {
      setLoading(false);
    }
  };

  const handleDev = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = await authApi.loginWithDevToken({
        userId: devUserId.trim(),
        clanId: devClanId.trim(),
        role: "owner",
        displayName: "DevAdmin",
      });
      onLoggedIn(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "dev-token недоступен");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <Card className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-sindaris-border">
          <KeyRound className="h-5 w-5 text-sindaris-accent" />
          <h3 className="font-bold text-base text-sindaris-text">ВХОД В ТЕРМИНАЛ</h3>
        </div>

        <p className="text-xs text-sindaris-muted">
          Основной вход — через Discord. Новые бойцы попадают в клан по умолчанию с ролью гостя.
        </p>

        {error && (
          <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/60 p-2 rounded-md">
            {error}
          </p>
        )}

        <Button type="button" className="w-full" onClick={handleDiscord}>
          Войти через Discord
        </Button>
      </Card>

      <Card className="space-y-4">
        <h3 className="font-bold text-sm text-sindaris-text">Invite-код клана</h3>
        <form onSubmit={handleRedeem} className="space-y-3">
          <Input
            label="Отображаемое имя"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
          <Input
            label="Код приглашения"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            required
          />
          <Button type="submit" variant="secondary" isLoading={loading} className="w-full">
            Вступить по коду
          </Button>
        </form>
      </Card>

      {env.enableDevLogin && (
        <Card className="space-y-4">
          <h3 className="font-bold text-sm text-sindaris-text">Локальный dev-token</h3>
          <form onSubmit={handleDev} className="space-y-3">
            <Input
              label="user_id"
              value={devUserId}
              onChange={(e) => setDevUserId(e.target.value)}
              required
            />
            <Input
              label="clan_id"
              value={devClanId}
              onChange={(e) => setDevClanId(e.target.value)}
              required
            />
            <Button type="submit" variant="ghost" isLoading={loading} className="w-full">
              Выдать JWT (ENV≠prod)
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
};
