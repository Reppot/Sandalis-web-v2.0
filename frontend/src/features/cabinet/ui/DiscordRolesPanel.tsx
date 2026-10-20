"use client";

import * as React from "react";
import { Loading, cn, errorText, useNotify, useT, type MessageKey } from "@/shared";
import { discordRolesApi, type DiscordRoles, type SyncableRole } from "@/features/cabinet/api/clanApi";

const OPTIONS: { value: SyncableRole | ""; label: MessageKey }[] = [
  { value: "", label: "droles.none" },
  { value: "guest", label: "role.guest" },
  { value: "member", label: "role.member" },
  { value: "officer", label: "role.officer" },
  { value: "admin", label: "role.admin" },
];

const hex = (color: number) => (color ? `#${color.toString(16).padStart(6, "0")}` : "var(--muted)");

/**
 * «Роли Discord» (admin+): роли сервера клана -> роли терминала. При входе через Discord
 * участник получает самую старшую сопоставленную роль и вступает в клан без приглашения.
 */
export const DiscordRolesPanel: React.FC = () => {
  const t = useT();
  const notify = useNotify();
  const [data, setData] = React.useState<DiscordRoles | null>(null);
  const [enabled, setEnabled] = React.useState(false);
  const [roleMap, setRoleMap] = React.useState<Record<string, SyncableRole>>({});
  const [busy, setBusy] = React.useState(false);

  const apply = (d: DiscordRoles) => {
    setData(d);
    setEnabled(d.enabled);
    setRoleMap(d.roleMap);
  };

  const load = React.useCallback(() => {
    setData(null);
    discordRolesApi
      .get()
      .then(apply)
      .catch((err) => notify({ title: "DISCORD", message: errorText(err, t("droles.loadFailed")), tone: "danger" }));
  }, [notify, t]);

  React.useEffect(load, [load]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await discordRolesApi.save(enabled, roleMap);
      apply(r.roles);
      notify({ title: "DISCORD", message: r.message, tone: "success" });
    } catch (err) {
      notify({ title: "DISCORD", message: errorText(err, t("droles.saveFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const mapped = Object.keys(roleMap).length;

  return (
    <section data-guide="cab-roles" className="panel panel-corners rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="panel-title">🛡 {t("droles.title")}</div>
        {data?.guildId && (
          <span className={cn("cabinet-pill", data.enabled && "cabinet-pill-online")}>
            {data.enabled ? `● ${t("droles.on")} • ${mapped}` : `○ ${t("droles.off")}`}
          </span>
        )}
      </div>
      <div className="cabinet-rule" />
      <p className="text-[0.78rem] text-white/70">{t("droles.hint")}</p>

      {!data ? (
        <Loading className="min-h-[90px]" />
      ) : !data.guildId ? (
        <p className="hud-label mt-3 text-warn">{t("droles.noGuild")}</p>
      ) : !data.botConfigured ? (
        <p className="hud-label mt-3 text-warn">{t("droles.noBotToken")}</p>
      ) : !data.botInGuild ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="hud-label flex-1 text-warn">{t("droles.addBot")}</p>
          {data.botInviteUrl && (
            <a className="btn btn-primary" href={data.botInviteUrl} target="_blank" rel="noreferrer">
              ＋ {t("droles.addBotButton")}
            </a>
          )}
          <button type="button" className="btn" onClick={load}>⟳ {t("common.sync")}</button>
        </div>
      ) : (
        <>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[0.82rem] text-white">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            {t("droles.enable")}
          </label>
          <ul className="scroll-area mt-3 grid max-h-80 gap-1.5 overflow-y-auto md:grid-cols-2">
            {data.roles.map((role) => (
              <li key={role.id} className="row-item flex items-center gap-2 text-xs">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: hex(role.color) }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-white">{role.name}</span>
                <select
                  className="field w-36 py-1 text-xs"
                  value={roleMap[role.id] ?? ""}
                  onChange={(e) =>
                    setRoleMap((prev) => {
                      const next = { ...prev };
                      if (e.target.value) next[role.id] = e.target.value as SyncableRole;
                      else delete next[role.id];
                      return next;
                    })
                  }
                >
                  {OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{t(o.label)}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          {data.roles.length === 0 && <p className="hud-label mt-3 text-muted">{t("droles.empty")}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn" disabled={busy} onClick={load}>⟳ {t("common.sync")}</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{t("common.save")}</button>
          </div>
        </>
      )}
    </section>
  );
};
