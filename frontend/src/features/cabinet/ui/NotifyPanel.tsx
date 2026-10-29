"use client";

import * as React from "react";
import { Loading, apiClient, errorText, useNotify, useT } from "@/shared";

interface NotifyState {
  dm: boolean;
  dm_available: boolean;
  push_key: string | null;
  push_devices: number;
}

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Настройки: дублировать почту сайта в ЛС Discord и push-уведомления в этом браузере. */
export const NotifyPanel: React.FC = () => {
  const t = useT();
  const notify = useNotify();
  const [state, setState] = React.useState<NotifyState | null>(null);
  const [sub, setSub] = React.useState<PushSubscription | null>(null);
  const [busy, setBusy] = React.useState(false);
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  React.useEffect(() => {
    apiClient.get<NotifyState>("/api/v1/notify").then(setState).catch(() => setState(null));
    if (supported) {
      navigator.serviceWorker.register("/sw.js").then((reg) => reg.pushManager.getSubscription()).then(setSub).catch(() => setSub(null));
    }
  }, [supported]);

  const fail = (err: unknown) => notify({ title: t("notify.title"), message: errorText(err, t("notify.failed")), tone: "danger" });
  const setDm = async (dm: boolean) => {
    setBusy(true);
    try {
      setState(await apiClient.put<NotifyState>("/api/v1/notify", { dm }));
      notify({ title: t("notify.title"), message: t("notify.saved"), tone: "success" });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const enablePush = async () => {
    if (!state?.push_key) return;
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        notify({ title: t("notify.title"), message: t("notify.pushDenied"), tone: "warning" });
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(state.push_key) });
      const json = s.toJSON();
      setState(await apiClient.post<NotifyState>("/api/v1/notify/push", { endpoint: json.endpoint, keys: json.keys }));
      setSub(s);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const disablePush = async () => {
    if (!sub) return;
    setBusy(true);
    try {
      await apiClient.post<void>("/api/v1/notify/push/remove", { endpoint: sub.endpoint });
      await sub.unsubscribe();
      setSub(null);
      setState(await apiClient.get<NotifyState>("/api/v1/notify"));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  if (!state) return <section className="panel"><Loading /></section>;
  return (
    <section className="panel flex flex-col gap-5 p-5">
      <div>
        <div className="panel-title">{t("notify.title")}</div>
        <p className="mt-1 text-sm text-fg-3">{t("notify.hint")}</p>
      </div>
      <label className="flex items-start gap-2 text-sm text-fg">
        <input type="checkbox" className="mt-1" checked={state.dm} disabled={busy || !state.dm_available} onChange={(e) => void setDm(e.target.checked)} />
        <span>
          {t("notify.dm")}
          <span className="block text-xs text-fg-3">{state.dm_available ? t("notify.dmHint") : t("notify.dmOff")}</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-fg">{t("notify.push")}</span>
        {!supported ? (
          <span className="text-xs text-fg-3">{t("notify.pushUnsupported")}</span>
        ) : !state.push_key ? (
          <span className="text-xs text-fg-3">{t("notify.pushUnavailable")}</span>
        ) : sub ? (
          <button type="button" className="btn h-8 min-h-0 px-3 text-sm" disabled={busy} onClick={() => void disablePush()}>{t("notify.pushOffBtn")}</button>
        ) : (
          <button type="button" className="btn btn-primary h-8 min-h-0 px-3 text-sm" disabled={busy} onClick={() => void enablePush()}>{t("notify.pushOn")}</button>
        )}
        {state.push_devices ? <span className="text-xs text-fg-3">{t("notify.pushDevices", { n: state.push_devices })}</span> : null}
      </div>
    </section>
  );
};
