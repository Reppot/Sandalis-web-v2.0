"use client";

import * as React from "react";
import type { ClanRole } from "@/entities/session";
import { Button, Card, Input, errorText, useToast } from "@/shared";
import { clanApi, type ClanApiTokenCreated } from "@/features/cabinet/api/clanApi";
import { Bot, Copy } from "lucide-react";

const roles: { value: ClanRole; label: string }[] = [
  { value: "guest", label: "Гость (только чтение)" },
  { value: "member", label: "Боец" },
  { value: "officer", label: "Офицер" },
];

/** Выпуск X-Clan-Token для ботов (clan:settings:write, admin+). */
export const ClanTokenPanel: React.FC = () => {
  const notify = useToast();
  const [label, setLabel] = React.useState("");
  const [role, setRole] = React.useState<ClanRole>("guest");
  const [expiresInHours, setExpiresInHours] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [issued, setIssued] = React.useState<ClanApiTokenCreated | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setLoading(true);
    try {
      const created = await clanApi.createClanToken({
        label: label.trim(),
        role,
        expiresInHours: expiresInHours > 0 ? expiresInHours : null,
      });
      setIssued(created);
      setLabel("");
      notify(created.message);
    } catch (err) {
      notify(errorText(err, "Не удалось выпустить токен"), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-sindaris-border">
        <Bot className="h-5 w-5 text-sindaris-accent" />
        <h3 className="font-bold text-base text-sindaris-text">API-ТОКЕН ДЛЯ БОТА</h3>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <Input label="Название" placeholder="discord-bot" value={label} onChange={(e) => setLabel(e.target.value)} required />
        <div className="space-y-1.5">
          <label className="block text-xs font-mono font-medium text-sindaris-muted">Роль</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as ClanRole)}
            className="flex h-10 w-full rounded-md border border-sindaris-border bg-sindaris-bg px-3 py-2 text-sm text-sindaris-text font-mono"
          >
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Срок, ч (0 = бессрочно)"
          type="number"
          min="0"
          value={expiresInHours}
          onChange={(e) => setExpiresInHours(Math.max(0, parseInt(e.target.value, 10) || 0))}
        />
        <Button type="submit" isLoading={loading}>
          Выпустить
        </Button>
      </form>

      {issued && (
        <div className="space-y-2 p-3 rounded-md border border-yellow-700/60 bg-yellow-950/20 text-xs">
          <p className="text-yellow-300">Токен показывается один раз — сохраните его сейчас. Заголовок: X-Clan-Token.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all font-mono text-sindaris-text">{issued.raw_token}</code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(issued.raw_token).then(() => notify("Токен скопирован"))}
              className="text-sindaris-muted hover:text-sindaris-text cursor-pointer"
              title="Скопировать"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
};
