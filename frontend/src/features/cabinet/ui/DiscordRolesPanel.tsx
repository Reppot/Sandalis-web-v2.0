"use client";

import * as React from "react";
import { Loading, cn, errorText, formatDateTime, useNotify, useT, type MessageKey } from "@/shared";
import type { AccessLevel } from "@/features/cabinet/api/authApi";
import { discordRolesApi, type DiscordMember, type DiscordRoles } from "@/features/cabinet/api/clanApi";

const LEVELS: { value: AccessLevel; label: MessageKey }[] = [
  { value: "basic", label: "level.basic" },
  { value: "medium", label: "level.medium" },
  { value: "high", label: "level.high" },
];
const LEVEL_LABEL = Object.fromEntries(LEVELS.map((l) => [l.value, l.label])) as Record<AccessLevel, MessageKey>;

const hex = (color: number) => (color ? `#${color.toString(16).padStart(6, "0")}` : "var(--muted)");

/**
 * «Роли Discord» — только командир: бот клана на сервере, роли сервера,
 * уровень доступа каждой роли (по умолчанию базовый) и участники сервера.
 */
export const DiscordRolesPanel: React.FC = () => {
  const t = useT();
  const notify = useNotify();
  const [data, setData] = React.useState<DiscordRoles | null>(null);
  const [levels, setLevels] = React.useState<Record<string, AccessLevel>>({});
  const [members, setMembers] = React.useState<{ status: string; members: DiscordMember[] } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const apply = (d: DiscordRoles) => {
    setData(d);
    setLevels(Object.fromEntries(d.roles.map((r) => [r.id, r.level])));
  };

  const load = React.useCallback(() => {
    setData(null);
    discordRolesApi
      .get()
      .then((d) => {
        apply(d);
        if (d.roles.length) discordRolesApi.members().then(setMembers).catch(() => setMembers(null));
      })
      .catch((err) => notify({ title: "DISCORD", message: errorText(err, t("droles.loadFailed")), tone: "danger" }));
  }, [notify, t]);

  React.useEffect(load, [load]);

  const act = async (action: () => Promise<{ roles: DiscordRoles; message: string }>) => {
    setBusy(true);
    try {
      const r = await action();
      apply(r.roles);
      notify({ title: "DISCORD", message: r.message, tone: "success" });
      discordRolesApi.members().then(setMembers).catch(() => setMembers(null));
    } catch (err) {
      notify({ title: "DISCORD", message: errorText(err, t("droles.saveFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const synced = Boolean(data?.syncedAt);

  return (
    <section data-guide="cab-roles" className="panel panel-corners rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="panel-title">🛡 {t("droles.title")}</div>
        {data?.guildId && (
          <span className={cn("cabinet-pill", synced && "cabinet-pill-online")}>
            {synced ? `● ${t("droles.on")} • ${data.roles.length}` : `○ ${t("droles.off")}`}
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
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className={cn("hud-label flex-1", data.botInGuild ? "text-muted" : "text-warn")}>
              {!data.botInGuild ? t("droles.addBot") : synced ? t("droles.synced", { at: formatDateTime(data.syncedAt!) }) : t("droles.notSynced")}
            </p>
            {!data.botInGuild && data.botInviteUrl && (
              <a className="btn btn-primary" href={data.botInviteUrl} target="_blank" rel="noreferrer">＋ {t("droles.addBotButton")}</a>
            )}
            {data.botInGuild && (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act(() => discordRolesApi.pull())}>⇩ {t("droles.pull")}</button>
            )}
            <button type="button" className="btn" disabled={busy} onClick={load}>⟳ {t("common.sync")}</button>
          </div>

          {synced && (
            <>
              <p className="hud-label mt-3 text-muted">{t("droles.levelsHelp")}</p>
              <ul className="scroll-area mt-2 grid max-h-80 gap-1.5 overflow-y-auto md:grid-cols-2">
                {data.roles.map((role) => (
                  <li key={role.id} className="row-item flex items-center gap-2 text-xs">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: hex(role.color) }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-white">{role.name}</span>
                    <select
                      className="field w-40 py-1 text-xs"
                      value={levels[role.id] ?? "basic"}
                      onChange={(e) => setLevels((prev) => ({ ...prev, [role.id]: e.target.value as AccessLevel }))}
                    >
                      {LEVELS.map((o) => (
                        <option key={o.value} value={o.value}>{t(o.label)}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
              {data.roles.length === 0 && <p className="hud-label mt-3 text-muted">{t("droles.empty")}</p>}
              <div className="mt-3 flex justify-end">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act(() => discordRolesApi.save(levels))}>{t("common.save")}</button>
              </div>

              <div className="hud-label mt-4 text-accent">{t("droles.members")}{members?.status === "ok" ? ` • ${members.members.length}` : ""}</div>
              {members?.status === "intent_required" ? (
                <p className="hud-label mt-2 text-warn">{t("droles.membersIntent")}</p>
              ) : members?.status === "ok" ? (
                <ul className="scroll-area mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
                  {members.members.map((m) => (
                    <li key={m.id} className={cn("row-item text-xs", !m.joined && "opacity-70")}>
                      <span className="min-w-0 flex-1 truncate text-white">{m.name}</span>
                      <span className="hidden min-w-0 flex-1 truncate text-muted md:inline">{m.roles.join(" • ") || "—"}</span>
                      <span className="text-accent">{t(LEVEL_LABEL[m.level])}</span>
                      <span className={m.joined ? "text-safe" : "text-muted"}>{t(m.joined ? "droles.joined" : "droles.notJoined")}</span>
                    </li>
                  ))}
                </ul>
              ) : members?.status === "no_bot" ? (
                <p className="hud-label mt-2 text-warn">{t("droles.addBot")}</p>
              ) : (
                <Loading className="min-h-[60px]" />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
};
