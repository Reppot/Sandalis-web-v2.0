"use client";

import * as React from "react";
import { Button, Card, Input, Spinner, cn, errorText, useToast } from "@/shared";
import { clanApi, type GrantableRole, type InviteCode } from "@/features/cabinet/api/clanApi";
import { Copy, Ticket, XCircle } from "lucide-react";

interface InvitesPanelProps {
  /** clan:members:write (admin+) — создание и отзыв; без него только просмотр. */
  canManage: boolean;
}

const roleLabels: Record<GrantableRole, string> = {
  guest: "Гость",
  member: "Боец",
  officer: "Офицер",
};

const selectClass =
  "flex h-10 w-full rounded-md border border-sindaris-border bg-sindaris-bg px-3 py-2 text-sm text-sindaris-text font-mono";

function inviteState(invite: InviteCode): { label: string; active: boolean } {
  if (invite.revokedAt) return { label: "отозван", active: false };
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) return { label: "истёк", active: false };
  if (invite.usedCount >= invite.maxUses) return { label: "исчерпан", active: false };
  return { label: "активен", active: true };
}

export const InvitesPanel: React.FC<InvitesPanelProps> = ({ canManage }) => {
  const notify = useToast();
  const [invites, setInvites] = React.useState<InviteCode[]>([]);
  const [showRevoked, setShowRevoked] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [role, setRole] = React.useState<GrantableRole>("member");
  const [maxUses, setMaxUses] = React.useState(1);
  const [expiresInHours, setExpiresInHours] = React.useState(72);
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setInvites(await clanApi.listInvites(showRevoked));
      setError(null);
    } catch (err) {
      setError(errorText(err, "Не удалось загрузить приглашения"));
    } finally {
      setLoading(false);
    }
  }, [showRevoked]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const copy = (code: string) => {
    void navigator.clipboard.writeText(code).then(() => notify(`Код ${code} скопирован`));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { invite, message } = await clanApi.createInvite({
        role,
        maxUses,
        expiresInHours: expiresInHours > 0 ? expiresInHours : null,
      });
      setInvites((prev) => [invite, ...prev]);
      notify(message);
    } catch (err) {
      notify(errorText(err, "Не удалось создать код"), "error");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (invite: InviteCode) => {
    if (!window.confirm(`Отозвать код ${invite.code}?`)) return;
    try {
      await clanApi.revokeInvite(invite.id);
      notify("Код отозван");
      await load();
    } catch (err) {
      notify(errorText(err, "Не удалось отозвать код"), "error");
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-sindaris-border">
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5 text-sindaris-accent" />
          <h3 className="font-bold text-base text-sindaris-text">ПРИГЛАШЕНИЯ В КЛАН</h3>
        </div>
        <label className="flex items-center gap-2 text-xs text-sindaris-muted cursor-pointer">
          <input type="checkbox" checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} />
          отозванные
        </label>
      </div>

      {canManage && (
        <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div className="space-y-1.5">
            <label className="block text-xs font-mono font-medium text-sindaris-muted">Роль</label>
            <select value={role} onChange={(e) => setRole(e.target.value as GrantableRole)} className={selectClass}>
              {(Object.keys(roleLabels) as GrantableRole[]).map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Использований"
            type="number"
            min="1"
            max="1000"
            value={maxUses}
            onChange={(e) => setMaxUses(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
          <Input
            label="Срок, ч (0 = бессрочно)"
            type="number"
            min="0"
            max="720"
            value={expiresInHours}
            onChange={(e) => setExpiresInHours(Math.max(0, parseInt(e.target.value, 10) || 0))}
          />
          <Button type="submit" isLoading={creating}>
            Создать код
          </Button>
        </form>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {loading ? (
        <div className="py-6 flex justify-center">
          <Spinner />
        </div>
      ) : invites.length === 0 ? (
        <p className="text-center py-4 text-xs text-sindaris-muted">Приглашений нет</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {invites.map((invite) => {
            const state = inviteState(invite);
            return (
              <div
                key={invite.id}
                className={cn(
                  "flex items-center justify-between gap-3 p-2 rounded-md bg-sindaris-bg border border-sindaris-border/50 text-xs",
                  !state.active && "opacity-60"
                )}
              >
                <button
                  type="button"
                  onClick={() => copy(invite.code)}
                  className="flex items-center gap-1.5 font-mono font-bold text-sindaris-accent cursor-pointer"
                  title="Скопировать код"
                >
                  {invite.code}
                  <Copy className="h-3 w-3 text-sindaris-muted" />
                </button>
                <span className="text-sindaris-muted">{roleLabels[invite.role as GrantableRole] ?? invite.role}</span>
                <span className="font-mono text-sindaris-muted">
                  {invite.usedCount}/{invite.maxUses}
                </span>
                <span className="text-sindaris-muted hidden md:inline">
                  {invite.expiresAt ? `до ${new Date(invite.expiresAt).toLocaleString("ru-RU")}` : "бессрочно"}
                </span>
                <span className={state.active ? "text-green-400" : "text-sindaris-muted"}>{state.label}</span>
                {canManage && state.active ? (
                  <button
                    type="button"
                    onClick={() => void handleRevoke(invite)}
                    className="text-red-400 hover:text-red-300 cursor-pointer"
                    title="Отозвать"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                ) : (
                  <span className="w-4" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
