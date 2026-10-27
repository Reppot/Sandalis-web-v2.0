"use client";

import * as React from "react";
import { Field, errorText, useNotify, useT } from "@/shared";
import { integrationsApi, managementApi, type ClanWebhook, type DiscordRole } from "@/features/management/api";

/** За сколько минут до конца резерва предупреждать. */
const LEADS = [30, 60, 120, 180, 360];

/** Вебхук текстового канала Discord для рапортов и напоминаний о резервах. URL — секрет: сервер отдаёт только хвост. */
export const DiscordWebhookPanel: React.FC = () => {
  const notify = useNotify();
  const t = useT();
  const [settings, setSettings] = React.useState<ClanWebhook | null>(null);
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [roles, setRoles] = React.useState<DiscordRole[]>([]);
  const [pingRole, setPingRole] = React.useState("");
  const [lead, setLead] = React.useState(120);

  React.useEffect(() => {
    integrationsApi.getWebhook().then((s) => {
      setSettings(s);
      setPingRole(s.timer_ping_role_id ?? "");
      setLead(s.timer_warn_minutes);
    }).catch(() => setSettings(null));
    managementApi.roles().then((r) => setRoles(r.roles)).catch(() => setRoles([]));
  }, []);

  const saveAlerts = async () => {
    setBusy(true);
    try {
      const r = await integrationsApi.setTimerAlerts(pingRole || null, lead);
      setSettings(r.settings);
      notify({ title: "DISCORD", message: t("webhook.remind.saved"), tone: "success" });
    } catch (err) {
      notify({ title: "DISCORD", message: errorText(err, t("webhook.saveFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const leadLabel = (m: number) => (m % 60 ? t("webhook.remind.minutes", { n: m }) : t("webhook.remind.hours", { n: m / 60 }));

  const save = async (value: string | null) => {
    setBusy(true);
    try {
      const r = await integrationsApi.setWebhook(value);
      setSettings(r.settings);
      setUrl("");
      notify({ title: "DISCORD", message: r.message, tone: "success" });
    } catch (err) {
      notify({ title: "DISCORD", message: errorText(err, t("webhook.saveFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-guide="cab-webhook" className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="panel-title">{t("webhook.title")}</div>
        <span className={`cabinet-pill ${settings?.discord_webhook_configured ? "cabinet-pill-online" : ""}`}>
          {settings?.discord_webhook_configured ? `${t("webhook.connected")} ${settings.discord_webhook_hint ?? ""}` : t("webhook.notSet")}
        </span>
      </div>
      <p className="mt-1 text-sm text-fg-3">
        {t("webhook.hint")}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label={t("webhook.url")} mono type="password" autoComplete="off" placeholder="https://discord.com/api/webhooks/..." value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={busy || !url.trim()} onClick={() => void save(url.trim())}>{t("common.save")}</button>
        {settings?.discord_webhook_configured && (
          <button className="btn btn-danger" disabled={busy} onClick={() => void save(null)}>{t("webhook.disable")}</button>
        )}
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <div className="text-sm font-semibold text-fg">{t("webhook.remind.title")}</div>
        <p className="mt-1 text-sm text-fg-3">{t("webhook.remind.hint")}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className="field-label">{t("webhook.remind.role")}</span>
            <select className="field" value={pingRole} onChange={(e) => setPingRole(e.target.value)}>
              <option value="">{t("webhook.remind.noRole")}</option>
              {roles.map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:w-48">
            <span className="field-label">{t("webhook.remind.lead")}</span>
            <select className="field" value={lead} onChange={(e) => setLead(Number(e.target.value))}>
              {[...new Set([...LEADS, lead])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{leadLabel(m)}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" disabled={busy} onClick={() => void saveAlerts()}>{t("common.save")}</button>
        </div>
      </div>
    </section>
  );
};
