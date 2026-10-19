"use client";

import * as React from "react";
import type { ClanRole } from "@/entities/session";
import { Field, Select, copyText, errorText, useNotify } from "@/shared";
import { clanApi, type ClanApiTokenCreated } from "@/features/cabinet/api/clanApi";

const ROLES: { value: ClanRole; label: string }[] = [
  { value: "guest", label: "Гость (только чтение)" },
  { value: "member", label: "Боец" },
  { value: "officer", label: "Офицер" },
];

/** Выпуск X-Clan-Token для ботов (clan:settings:write, admin+). Токен показывается один раз. */
export const ClanTokenPanel: React.FC = () => {
  const notify = useNotify();
  const [label, setLabel] = React.useState("");
  const [role, setRole] = React.useState<ClanRole>("guest");
  const [hours, setHours] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [issued, setIssued] = React.useState<ClanApiTokenCreated | null>(null);

  const issue = async () => {
    if (!label.trim()) return;
    setBusy(true);
    try {
      const created = await clanApi.createClanToken({ label: label.trim(), role, expiresInHours: hours > 0 ? hours : null });
      setIssued(created);
      setLabel("");
      notify({ title: "API-ТОКЕН", message: created.message, tone: "success" });
    } catch (err) {
      notify({ title: "API-ТОКЕН", message: errorText(err, "Не удалось выпустить токен"), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel panel-corners rounded-md p-4">
      <div className="panel-title">🤖 API-токен для бота</div>
      <div className="cabinet-rule" />
      <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-4">
        <Field label="Название" placeholder="discord-bot" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Select label="Роль" value={role} onChange={(e) => setRole(e.target.value as ClanRole)}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </Select>
        <Field label="Срок, ч (0 = бессрочно)" type="number" min={0} value={hours} onChange={(e) => setHours(Math.max(0, parseInt(e.target.value, 10) || 0))} />
        <button className="btn btn-primary h-[38px]" disabled={busy || !label.trim()} onClick={() => void issue()}>{busy ? "ПЕРЕДАЧА..." : "Выпустить"}</button>
      </div>

      {issued && (
        <div className="mt-3 space-y-2 rounded border border-yellow-700/60 bg-yellow-950/20 p-3 text-xs">
          <p className="text-warn">Токен показывается один раз — сохраните его сейчас. Заголовок: X-Clan-Token.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono break-all text-white">{issued.raw_token}</code>
            <button className="btn px-2 py-1" title="Скопировать" onClick={() => void copyText(issued.raw_token).then((ok) => ok && notify({ title: "API-ТОКЕН", message: "Токен скопирован", tone: "success" }))}>⧉</button>
          </div>
        </div>
      )}
    </section>
  );
};
