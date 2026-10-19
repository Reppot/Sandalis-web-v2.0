"use client";

import * as React from "react";
import { Field, Loading, Select, cn, copyText, errorText, formatDateTime, useConfirm, useNotify } from "@/shared";
import { clanApi, type GrantableRole, type InviteCode } from "@/features/cabinet/api/clanApi";

const ROLE_LABEL: Record<GrantableRole, string> = { guest: "Гость", member: "Боец", officer: "Офицер" };

function inviteState(invite: InviteCode): { label: string; active: boolean } {
  if (invite.revokedAt) return { label: "отозван", active: false };
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) return { label: "истёк", active: false };
  if (invite.usedCount >= invite.maxUses) return { label: "исчерпан", active: false };
  return { label: "активен", active: true };
}

/** Пригласительные коды клана: officer+ видит, admin+ создаёт и отзывает. */
export const InvitesPanel: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const notify = useNotify();
  const [invites, setInvites] = React.useState<InviteCode[]>([]);
  const [showRevoked, setShowRevoked] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [role, setRole] = React.useState<GrantableRole>("member");
  const [maxUses, setMaxUses] = React.useState(1);
  const [hours, setHours] = React.useState(72);
  const [creating, setCreating] = React.useState(false);
  const [armed, confirm] = useConfirm();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setInvites(await clanApi.listInvites(showRevoked));
    } catch (err) {
      notify({ title: "ПРИГЛАШЕНИЯ", message: errorText(err, "Не удалось загрузить приглашения"), tone: "danger" });
    } finally {
      setLoading(false);
    }
  }, [showRevoked, notify]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      const { invite, message } = await clanApi.createInvite({ role, maxUses, expiresInHours: hours > 0 ? hours : null });
      setInvites((prev) => [invite, ...prev]);
      notify({ title: "ПРИГЛАШЕНИЯ", message, tone: "success" });
    } catch (err) {
      notify({ title: "ПРИГЛАШЕНИЯ", message: errorText(err, "Не удалось создать код"), tone: "danger" });
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (invite: InviteCode) => {
    try {
      await clanApi.revokeInvite(invite.id);
      notify({ title: "ПРИГЛАШЕНИЯ", message: `Код ${invite.code} отозван.`, tone: "warning" });
      await load();
    } catch (err) {
      notify({ title: "ПРИГЛАШЕНИЯ", message: errorText(err, "Не удалось отозвать код"), tone: "danger" });
    }
  };

  return (
    <section className="panel panel-corners rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="panel-title">🎟 Приглашения в клан</div>
        <label className="hud-label flex cursor-pointer items-center gap-2 text-muted">
          <input type="checkbox" checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} />
          отозванные
        </label>
      </div>
      <div className="cabinet-rule" />

      {canManage && (
        <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-4">
          <Select label="Роль" value={role} onChange={(e) => setRole(e.target.value as GrantableRole)}>
            {(Object.keys(ROLE_LABEL) as GrantableRole[]).map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </Select>
          <Field label="Использований" type="number" min={1} max={1000} value={maxUses} onChange={(e) => setMaxUses(Math.max(1, parseInt(e.target.value, 10) || 1))} />
          <Field label="Срок, ч (0 = бессрочно)" type="number" min={0} max={720} value={hours} onChange={(e) => setHours(Math.max(0, parseInt(e.target.value, 10) || 0))} />
          <button className="btn btn-primary h-[38px]" disabled={creating} onClick={() => void create()}>{creating ? "ПЕРЕДАЧА..." : "＋ Создать код"}</button>
        </div>
      )}

      {loading ? (
        <Loading label="📡 ЗАГРУЗКА КОДОВ..." className="min-h-[90px]" />
      ) : invites.length === 0 ? (
        <p className="hud-label py-4 text-center text-muted">Приглашений нет</p>
      ) : (
        <ul className="scroll-area mt-3 flex max-h-80 flex-col gap-1">
          {invites.map((invite) => {
            const state = inviteState(invite);
            return (
              <li key={invite.id} className={cn("row-item text-xs", !state.active && "opacity-60")}>
                <button
                  type="button"
                  className="font-mono font-bold text-accent"
                  title="Скопировать код"
                  onClick={() => void copyText(invite.code).then((ok) => ok && notify({ title: "ПРИГЛАШЕНИЯ", message: `Код ${invite.code} скопирован`, tone: "success" }))}
                >
                  {invite.code} ⧉
                </button>
                <span className="text-muted">{ROLE_LABEL[invite.role as GrantableRole] ?? invite.role}</span>
                <span className="font-mono text-muted">{invite.usedCount}/{invite.maxUses}</span>
                <span className="hidden text-muted md:inline">{invite.expiresAt ? `до ${formatDateTime(invite.expiresAt)}` : "бессрочно"}</span>
                <span className={state.active ? "text-safe" : "text-muted"}>{state.label}</span>
                {canManage && state.active ? (
                  <button className={`btn btn-danger px-2 py-0.5 ${armed === invite.id ? "btn-active" : ""}`} onClick={() => confirm(invite.id, () => void revoke(invite))}>
                    {armed === invite.id ? "?" : "✕"}
                  </button>
                ) : (
                  <span className="w-6" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
