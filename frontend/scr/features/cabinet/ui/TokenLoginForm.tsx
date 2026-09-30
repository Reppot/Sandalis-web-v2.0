import * as React from "react";
import { Card, Input, Button } from "@/shared";
import { KeyRound } from "lucide-react";

interface TokenLoginFormProps {
  onLogin: (token: string) => Promise<void>;
}

export const TokenLoginForm: React.FC<TokenLoginFormProps> = ({ onLogin }) => {
  const [token, setToken] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onLogin(token.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неверный токен доступа");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-md mx-auto space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-sindaris-border">
        <KeyRound className="h-5 w-5 text-sindaris-accent" />
        <h3 className="font-bold text-base text-sindaris-text">ВХОД В ТЕРМИНАЛ</h3>
      </div>

      <p className="text-xs text-sindaris-muted">
        Введите персональный ACCESS_TOKEN для авторизации в системе.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="password"
          placeholder="Токен доступа..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
          error={error ?? undefined}
          required
        />

        <Button type="submit" isLoading={loading} className="w-full">
          Авторизоваться
        </Button>
      </form>
    </Card>
  );
};