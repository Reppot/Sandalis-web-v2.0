"use client";

import * as React from "react";
import type { ClanRole } from "@/entities/session";
import { Field, Select, copyText, errorText, useNotify, useT, type MessageKey } from "@/shared";
import { integrationsApi, type ClanApiTokenCreated } from "@/features/management/api";

const ROLES: { value: ClanRole; label: MessageKey }[] = [
  { value: "guest", label: "role.guestReadOnly" },
  { value: "member", label: "role.member" },
  { value: "officer", label: "role.officer" },
];

/** Выпуск X-Clan-Token для ботов (clan:settings:write, admin+). Токен показывается один раз. */
export const ClanTokenPanel: React.FC = () => {
  const notify = useNotify();
  const t = useT();
  const [label, setLabel] = React.useState("");
  const [role, setRole] = React.useState<ClanRole>("guest");
  const [hours, setHours] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [issued, setIssued] = React.useState<ClanApiTokenCreated | null>(null);

  const issue = async () => {
    if (!label.trim()) return;
    setBusy(true);
    try {
      const created = await integrationsApi.createClanToken({ label: label.trim(), role, expiresInHours: hours > 0 ? hours : null });
      setIssued(created);
      setLabel("");
      notify({ title: t("token.title"), message: created.message, tone: "success" });
    } catch (err) {
      notify({ title: t("token.title"), message: errorText(err, t("token.failed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-guide="cab-token" className="panel panel-corners rounded-md p-4">
      <div className="panel-title">🤖 {t("token.heading")}</div>
      <div className="cabinet-rule" />
      <p className="mb-3 text-[0.78rem] leading-relaxed text-white/70">{t("token.why")}</p>
      <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-4">
        <Field label={t("token.name")} placeholder="discord-bot" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Select label={t("cabinet.role")} value={role} onChange={(e) => setRole(e.target.value as ClanRole)}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{t(r.label)}</option>
          ))}
        </Select>
        <Field label={t("invites.ttl")} type="number" min={0} value={hours} onChange={(e) => setHours(Math.max(0, parseInt(e.target.value, 10) || 0))} />
        <button className="btn btn-primary h-[38px]" disabled={busy || !label.trim()} onClick={() => void issue()}>{busy ? t("common.sending") : t("token.issue")}</button>
      </div>

      {issued && (
        <div className="mt-3 space-y-2 rounded border border-yellow-700/60 bg-yellow-950/20 p-3 text-xs">
          <p className="text-warn">{t("token.once")}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono break-all text-white">{issued.raw_token}</code>
            <button className="btn px-2 py-1" title={t("common.copy")} onClick={() => void copyText(issued.raw_token).then((ok) => ok && notify({ title: t("token.title"), message: t("token.copied"), tone: "success" }))}>⧉</button>
          </div>
        </div>
      )}
    </section>
  );
};
