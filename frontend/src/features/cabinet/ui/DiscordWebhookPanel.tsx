"use client";

import * as React from "react";
import { Field, errorText, useNotify } from "@/shared";
import { clanSettingsApi, type ClanSettings } from "@/features/cabinet/api/clanApi";

/** Вебхук текстового канала Discord для рапортов. URL — секрет: сервер отдаёт только хвост. */
export const DiscordWebhookPanel: React.FC = () => {
  const notify = useNotify();
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
      notify({ title: "DISCORD", message: errorText(err, "Вебхук не сохранён"), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel panel-corners rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="panel-title">📨 Канал Discord для рапортов</div>
        <span className={`cabinet-pill ${settings?.discord_webhook_configured ? "cabinet-pill-online" : ""}`}>
          {settings?.discord_webhook_configured ? `● ПОДКЛЮЧЁН ${settings.discord_webhook_hint ?? ""}` : "○ НЕ НАСТРОЕН"}
        </span>
      </div>
      <div className="cabinet-rule" />
      <p className="text-[0.78rem] text-white/70">
        Discord → Настройки канала → Интеграции → Вебхуки → «Скопировать URL». Рапорты со страницы «Текущие заказы клана» уходят в этот канал.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="URL вебхука" mono type="password" autoComplete="off" placeholder="https://discord.com/api/webhooks/..." value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={busy || !url.trim()} onClick={() => void save(url.trim())}>Сохранить</button>
        {settings?.discord_webhook_configured && (
          <button className="btn btn-danger" disabled={busy} onClick={() => void save(null)}>Отключить</button>
        )}
      </div>
    </section>
  );
};
