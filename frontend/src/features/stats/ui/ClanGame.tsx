"use client";

import * as React from "react";
import { WEIGHT_KEYS, gameClanApi, type GameSettings, type GameSettingsRead, type Summary } from "@/features/stats/model/game";
import { LeagueBanner } from "@/features/stats/ui/LeagueBanner";
import { Icon, Loading, cn, errorText, roleColor, useI18n, useNotify, type MessageKey } from "@/shared";

/** Цель недели клана и соревнование отрядов (роли Discord) — над рейтингом. */
export const ClanStrip: React.FC<{ summary: Summary }> = ({ summary }) => {
  const { t, dateLocale } = useI18n();
  const g = summary.goal;
  if (!g && !summary.squads.length) return null;
  const pct = g ? Math.min(100, Math.round((g.progress / g.target) * 100)) : 0;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {g ? (
        <section className={cn("panel p-5", g.done && "game-goal-done")}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="panel-title">{t("game.goalTitle")}</h2>
            <span className="text-xs text-fg-3">{g.done ? t("game.goalDone") : t("game.goalLeft", { n: (g.target - g.progress).toLocaleString(dateLocale) })}</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <b className="text-2xl tabular text-fg">{g.progress.toLocaleString(dateLocale)}</b>
            <span className="text-sm text-fg-3">/ {g.target.toLocaleString(dateLocale)} {t("game.cratesShort")}</span>
          </div>
          <div className="game-progress mt-2"><i style={{ width: `${pct}%` }} /></div>
          {g.contributors.length ? (
            <p className="mt-2 text-xs text-fg-3">
              {t("game.goalWho")}{" "}
              {g.contributors.slice(0, 8).map(([u, n], i) => `${i ? ", " : ""}${summary.names[u] ?? u} (${n})`).join("")}
            </p>
          ) : null}
        </section>
      ) : null}
      {summary.squads.length ? (
        <section className="panel p-5">
          <h2 className="panel-title">{t("game.squadsTitle")}</h2>
          <p className="mt-0.5 text-xs text-fg-3">{t("game.squadsHint")}</p>
          <ol className="mt-3 flex flex-col gap-1.5">
            {summary.squads.map((sq) => (
              <li key={sq.role_id} className="flex items-center gap-3 text-sm">
                <span className={cn("game-rank", sq.rank <= 3 && `is-top${sq.rank}`)}>{sq.rank}</span>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: sq.color ? roleColor(sq.color) : "var(--fg-3)" }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-fg">{sq.name}</span>
                <span className="text-xs text-fg-3">{t("game.squadActive", { n: sq.active, total: sq.members })}</span>
                <b className="w-16 text-right tabular text-fg">{sq.per_active.toLocaleString(dateLocale)}</b>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
};

/** Зал славы: топ-3 каждой прошедшей войны. */
export const HallOfFame: React.FC<{ summary: Summary; onOpen: (userId: string) => void }> = ({ summary, onOpen }) => {
  const { t, dateLocale } = useI18n();
  if (!summary.hall.length) return null;
  const medal = ["is-top1", "is-top2", "is-top3"];
  return (
    <section className="panel p-5">
      <h2 className="panel-title">{t("game.hallTitle")}</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summary.hall.map((h) => (
          <div key={`${h.war}-${h.until}`} className="game-ach flex-col">
            <div className="text-sm font-semibold text-fg">{t("game.hallWar", { n: h.war ?? "?" })}</div>
            <ol className="mt-1 flex flex-col gap-1">
              {h.top.map((e, i) => (
                <li key={e.user_id}>
                  <button type="button" className="flex w-full items-center gap-2 text-left text-sm hover:underline" onClick={() => onOpen(e.user_id)}>
                    <span className={cn("game-rank", medal[i])}>{i + 1}</span>
                    <LeagueBanner tier={e.tier} size={18} />
                    <span className="min-w-0 flex-1 truncate text-fg">{e.name}</span>
                    <span className="tabular text-fg-3">{Math.round(e.points).toLocaleString(dateLocale)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
};

/** Настройки командира: включение, цель недели, отряды, исключённые роли, роли лиг, веса очков. */
export const GameSettingsView: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const { t } = useI18n();
  const notify = useNotify();
  const [data, setData] = React.useState<GameSettingsRead | null>(null);
  const [draft, setDraft] = React.useState<GameSettings | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    gameClanApi.settings().then((d) => {
      setData(d);
      setDraft({ enabled: d.enabled, weights: d.weights, excluded_roles: d.excluded_roles, squads: d.squads, weekly_goal: d.weekly_goal, league_roles: d.league_roles });
    }).catch((err) => notify({ title: t("game.settingsTitle"), message: errorText(err, t("stats.loadFailed")), tone: "danger" }));
  }, [notify, t]);

  if (!data || !draft) return <section className="panel"><Loading /></section>;
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => setDraft({ ...draft, [k]: v });
  const toggle = (k: "squads" | "excluded_roles", id: string) =>
    set(k, draft[k].includes(id) ? draft[k].filter((x) => x !== id) : [...draft[k], id]);
  const save = async () => {
    setBusy(true);
    try {
      const d = await gameClanApi.save(draft);
      setData(d);
      notify({ title: t("game.settingsTitle"), message: t("game.settingsSaved"), tone: "success" });
      onSaved();
    } catch (err) {
      notify({ title: t("game.settingsTitle"), message: errorText(err, t("game.settingsFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const roleList = (k: "squads" | "excluded_roles") => (
    <div className="mt-2 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
      {data.roles.length === 0 ? <span className="text-sm text-fg-3">{t("game.noRoles")}</span> : data.roles.map((r) => (
        <button key={r.id} type="button" className={cn("chip", draft[k].includes(r.id) && "is-active")} onClick={() => toggle(k, r.id)}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color ? roleColor(r.color) : "var(--fg-3)" }} aria-hidden />
          {r.name}
        </button>
      ))}
    </div>
  );

  return (
    <section className="panel flex flex-col gap-5 p-5">
      <div>
        <h2 className="panel-title">{t("game.settingsTitle")}</h2>
        <p className="mt-1 text-sm text-fg-3">{t("game.settingsHint")}</p>
      </div>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={draft.enabled} onChange={(e) => set("enabled", e.target.checked)} />
        {t("game.setEnabled")}
      </label>
      <label className="flex flex-col gap-1 sm:max-w-xs">
        <span className="field-label">{t("game.setGoal")}</span>
        <input className="field" type="number" min={0} step={50} value={draft.weekly_goal} onChange={(e) => set("weekly_goal", Math.max(0, Number(e.target.value) || 0))} />
        <span className="text-xs text-fg-3">{t("game.setGoalHint")}</span>
      </label>
      <div>
        <span className="field-label">{t("game.setSquads")}</span>
        <p className="text-xs text-fg-3">{t("game.setSquadsHint")}</p>
        {roleList("squads")}
      </div>
      <div>
        <span className="field-label">{t("game.setExcluded")}</span>
        <p className="text-xs text-fg-3">{t("game.setExcludedHint")}</p>
        {roleList("excluded_roles")}
      </div>
      <label className="flex items-start gap-2 text-sm text-fg">
        <input type="checkbox" className="mt-1" checked={draft.league_roles} onChange={(e) => set("league_roles", e.target.checked)} />
        <span>
          {t("game.setRoles")}
          <span className="block text-xs text-fg-3">{data.bot ? t("game.setRolesHint") : t("game.setRolesNoBot")}</span>
        </span>
      </label>
      <div>
        <span className="field-label">{t("game.setWeights")}</span>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {WEIGHT_KEYS.map((k) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-xs text-fg-2">{t(`game.w.${k}` as MessageKey)}</span>
              <input className="field" type="number" min={0} max={1000} step={0.5} value={draft.weights[k] ?? data.defaults[k]}
                onChange={(e) => set("weights", { ...draft.weights, [k]: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
          ))}
        </div>
        <button type="button" className="btn mt-2 h-8 min-h-0 px-3 text-sm" onClick={() => set("weights", { ...data.defaults })}>
          <Icon name="refresh" size={13} />
          {t("game.setReset")}
        </button>
      </div>
      <div className="flex justify-end">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{t("common.save")}</button>
      </div>
    </section>
  );
};
