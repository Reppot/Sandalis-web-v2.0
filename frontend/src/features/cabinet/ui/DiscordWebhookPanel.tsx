"use client";

import * as React from "react";
import { Field, errorText, useNotify, useT } from "@/shared";
import { clanSettingsApi, type ClanSettings } from "@/features/cabinet/api/clanApi";

/** Вебхук текстового канала Discord для рапортов. URL — секрет: сервер отдаёт только хвост. */
export const DiscordWebhookPanel: React.FC = () => {
  const notify = useNotify();
  const t = useT();
  const [settings, setSettings] = React.useState<ClanSettings | null>(null);
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    clanSettingsApi.get().then(setSettings).catch(() => setSettings(null));
  }, []);

  const save = async (value: string | null) => {
    setBusy(true);
    try {
      const r = await clanSettingsApi.setWebhook(value);
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
    <section className="panel panel-corners rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="panel-title">📨 {t("webhook.title")}</div>
        <span className={`cabinet-pill ${settings?.discord_webhook_configured ? "cabinet-pill-online" : ""}`}>
          {settings?.discord_webhook_configured ? `● ${t("webhook.connected")} ${settings.discord_webhook_hint ?? ""}` : `○ ${t("webhook.notSet")}`}
        </span>
      </div>
      <div className="cabinet-rule" />
      <p className="text-[0.78rem] text-white/70">
        {t("webhook.hint")}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label={t("webhook.url")} mono type="password" autoComplete="off" placeholder="https://discord.com/api/webhooks/..." value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={busy || !url.trim()} onClick={() => void save(url.trim())}>{t("common.save")}</button>
        {settings?.discord_webhook_configured && (
          <button className="btn btn-danger" disabled={busy} onClick={() => void save(null)}>{t("webhook.disable")}</button>
        )}
      </div>
    </section>
  );
};
