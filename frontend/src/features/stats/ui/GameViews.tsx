"use client";

import * as React from "react";
import { CATEGORIES, PERIODS, ROMAN, gameApi, type Board, type Category, type Period, type Profile } from "@/features/stats/model/game";
import { LeagueBanner } from "@/features/stats/ui/LeagueBanner";
import { EmptyState, Icon, Loading, Segmented, cn, errorText, formatDateTime, useI18n, useNotify, type IconName, type MessageKey } from "@/shared";

const fmt = (n: number, locale: string, digits = 0) => n.toLocaleString(locale, { maximumFractionDigits: digits });

/** Рейтинг: период × категория, топ и ваша позиция. Клик по строке — профиль бойца. */
export const LeaderboardView: React.FC<{ myId: string; onOpen: (userId: string) => void }> = ({ myId, onOpen }) => {
  const { t, dateLocale } = useI18n();
  const notify = useNotify();
  const [period, setPeriod] = React.useState<Period>("week");
  const [category, setCategory] = React.useState<Category>("points");
  const [data, setData] = React.useState<Board | null>(null);

  React.useEffect(() => {
    setData(null);
    gameApi.board(period, category).then(setData).catch((err) => {
      notify({ title: t("stats.tab.rating"), message: errorText(err, t("stats.loadFailed")), tone: "danger" });
      setData({ period, category, season: { war: null, since: null }, rows: [], me: null, participants: 0 });
    });
  }, [period, category, notify, t]);

  const value = (v: number) => (category === "ontime" ? `${fmt(v, dateLocale, 1)} %` : fmt(v, dateLocale, category === "points" ? 1 : 0));
  const meOutside = data?.me && !data.rows.some((r) => r.user_id === data.me!.user_id) ? data.me : null;

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label={t("game.periodLabel")} value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p, label: t(`game.period.${p}` as MessageKey) }))} />
        {data?.season.war && period === "season" ? <span className="text-xs text-fg-3">{t("game.seasonWar", { n: data.season.war })}</span> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className={cn("chip", category === c && "is-active")} onClick={() => setCategory(c)} title={t(`game.catHint.${c}` as MessageKey)}>
            {t(`game.cat.${c}` as MessageKey)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-fg-3">{t(`game.catHint.${category}` as MessageKey)}</p>

      {!data ? (
        <Loading />
      ) : data.rows.length === 0 ? (
        <EmptyState icon="stats" title={t("game.empty")} hint={t("game.emptyHint")} />
      ) : (
        <ol className="game-board mt-4">
          {[...data.rows, ...(meOutside ? [meOutside] : [])].map((r) => (
            <li key={r.user_id} className={cn("game-row", r.user_id === myId && "is-me", r === meOutside && "is-gap")}>
              <button type="button" onClick={() => onOpen(r.user_id)}>
                <span className={cn("game-rank", r.rank <= 3 && `is-top${r.rank}`)}>{r.rank}</span>
                <LeagueBanner tier={r.league.tier} division={r.league.division} title={r.title} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-fg">{r.name}{r.user_id === myId ? ` · ${t("game.you")}` : ""}</span>
                  <span className="block text-xs text-fg-3">
                    {r.title ? `${t(`game.title.${r.title}` as MessageKey)} · ` : ""}
                    {t(`game.tier.${r.league.tier}` as MessageKey)}{r.league.division ? ` ${ROMAN[r.league.division]}` : ""}
                  </span>
                </span>
                {r.streak >= 2 ? <span className="game-streak" title={t("game.streakNow", { n: r.streak })}><Icon name="sparkles" size={12} />{r.streak}</span> : null}
                <span className="game-value tabular">{value(r.value)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {data && data.participants ? <p className="mt-3 text-xs text-fg-3">{t("game.participants", { n: data.participants })}</p> : null}
    </section>
  );
};

const KINDS = ["delivery", "line_done", "reserve", "attend", "order_done"] as const;

/** Профиль бойца: баннер лиги, прогресс до следующей ступени, сезон, откуда очки, недели, последние начисления. */
export const ProfileView: React.FC<{ userId: string; myId: string; onBack?: () => void }> = ({ userId, myId, onBack }) => {
  const { t, dateLocale } = useI18n();
  const [data, setData] = React.useState<Profile | null | "none">(null);

  React.useEffect(() => {
    setData(null);
    gameApi.profile(userId).then(setData).catch(() => setData("none"));
  }, [userId]);

  if (data === null) return <section className="panel"><Loading /></section>;
  if (data === "none") return <section className="panel"><EmptyState icon="stats" title={t("game.empty")} hint={t("game.profileEmpty")} /></section>;

  const lg = data.league;
  const span = lg.next_at ? lg.next_at - lg.floor : 1;
  const pct = lg.next_at ? Math.min(100, Math.round(((lg.points - lg.floor) / span) * 100)) : 100;
  const maxWeek = Math.max(1, ...data.weeks.map((w) => w.points));
  const totalPts = KINDS.reduce((s, k) => s + data.breakdown[k], 0) || 1;

  return (
    <div className="flex flex-col gap-4">
      <section className="panel game-hero">
        {onBack ? <button type="button" className="btn h-8 min-h-0 self-start px-2.5 text-sm" onClick={onBack}>← {t("game.back")}</button> : null}
        <div className="flex flex-wrap items-center gap-5">
          <LeagueBanner tier={lg.tier} division={lg.division} title={data.title} size={96} />
          <div className="min-w-0 flex-1">
            <div className="text-xl font-semibold text-fg">{data.name}{data.user_id === myId ? ` · ${t("game.you")}` : ""}</div>
            <div className="mt-0.5 text-sm text-fg-2">
              {data.title ? `${t(`game.title.${data.title}` as MessageKey)} · ` : ""}
              {t(`game.tier.${lg.tier}` as MessageKey)}{lg.division ? ` ${ROMAN[lg.division]}` : ""} · {t("game.points", { n: fmt(lg.points, dateLocale) })}
            </div>
            <div className="game-progress mt-3"><i style={{ width: `${pct}%` }} /></div>
            <div className="mt-1 text-xs text-fg-3">
              {lg.next_at ? t("game.toNext", { n: fmt(lg.next_at - lg.points, dateLocale) }) : t("game.maxTier")}
            </div>
          </div>
          <div className="game-season">
            <span className="text-xs text-fg-3">{t("game.streakLabel")}</span>
            <b className="tabular">{data.streak.current}</b>
            <span className="text-xs text-fg-3">{t("game.streakBest", { n: data.streak.best })}</span>
          </div>
          <div className="game-season">
            <span className="text-xs text-fg-3">{t("game.period.season")}</span>
            <b className="tabular">{fmt(data.season_points, dateLocale, 1)}</b>
            <span className="text-xs text-fg-3">{data.season_rank ? t("game.seasonRank", { n: data.season_rank }) : "—"}</span>
          </div>
        </div>
      </section>

      <section className="stats-kpis">
        <div className="panel stats-kpi"><span className="stats-kpi-value tabular">{fmt(data.crates, dateLocale)}</span><span className="stats-kpi-label">{t("game.kpi.crates")}</span></div>
        <div className="panel stats-kpi"><span className="stats-kpi-value tabular">{fmt(data.units, dateLocale)}</span><span className="stats-kpi-label">{t("game.kpi.units")}</span></div>
        <div className="panel stats-kpi"><span className="stats-kpi-value tabular">{fmt(data.reserves, dateLocale)}</span><span className="stats-kpi-label">{t("game.kpi.reserves")}</span></div>
        <div className="panel stats-kpi"><span className="stats-kpi-value tabular">{data.due_total ? `${Math.round((100 * data.due_ok) / data.due_total)} %` : "—"}</span><span className="stats-kpi-label">{t("game.kpi.ontime", { n: data.due_total })}</span></div>
        <div className="panel stats-kpi"><span className="stats-kpi-value tabular">{fmt(data.operations, dateLocale)}</span><span className="stats-kpi-label">{t("game.kpi.operations")}</span></div>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <section className="panel p-5">
          <h2 className="panel-title">{t("game.whereFrom")}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {KINDS.map((k) => (
              <li key={k} className="text-sm">
                <div className="flex justify-between gap-2"><span className="text-fg-2">{t(`game.kind.${k}` as MessageKey)}</span><b className="tabular text-fg">{fmt(data.breakdown[k], dateLocale, 1)}</b></div>
                <div className="game-progress is-thin mt-1"><i style={{ width: `${(data.breakdown[k] / totalPts) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
          <h2 className="panel-title mt-5">{t("game.weeks")}</h2>
          <div className="stats-chart mt-2" role="img" aria-label={t("game.weeks")}>
            {data.weeks.map((w) => (
              <div key={w.start} className="stats-bar" title={`${new Date(w.start).toLocaleDateString(dateLocale)} — ${fmt(w.points, dateLocale, 1)}`}>
                <span className="stats-bar-stack" style={{ height: `${(w.points / maxWeek) * 100}%` }}><span className="is-deliveries" style={{ flexGrow: 1 }} /></span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel p-5">
          <h2 className="panel-title">{t("game.recent")}</h2>
          {data.recent.length === 0 ? (
            <p className="mt-3 text-sm text-fg-3">{t("game.profileEmpty")}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {data.recent.map((c, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="text-fg">{t(`game.kind.${c.kind}` as MessageKey)}</span>
                    {c.title ? <span className="text-fg-3"> · {c.title}</span> : null}
                    {c.crates || c.units ? <span className="text-fg-3"> · {c.crates ? t("game.cratesN", { n: c.crates }) : ""}{c.crates && c.units ? ", " : ""}{c.units ? t("game.unitsN", { n: c.units }) : ""}</span> : null}
                    <span className="block text-xs text-fg-3">{formatDateTime(c.at)}</span>
                  </span>
                  <b className="shrink-0 tabular text-accent">+{fmt(c.points, dateLocale, 1)}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="panel-title">{t("game.achievements")}</h2>
          <span className="text-xs text-fg-3">{t("game.achCount", { n: data.achievements.filter((a) => a.level).length, total: data.achievements.length })}</span>
        </div>
        <ul className="game-achs mt-4">
          {data.achievements.map((a) => <AchievementTile key={a.key} a={a} />)}
        </ul>
      </section>
      <p className="text-xs text-fg-3">{t("game.rules")}</p>
    </div>
  );
};

const ACH_ICON: Record<string, IconName> = {
  first_delivery: "box", hauler: "box", keeper: "shield", savior: "clock", on_time: "check", closer: "flag",
  op_pillar: "anchor", veteran: "users", hot_week: "sparkles", streak: "history", multitasker: "grid", team_player: "heart",
};
/** Цвет медали: ступени бронза → серебро → золото; одноступенчатые — сразу золото. */
const medal = (level: number, levels: number) => (level === 0 ? "is-locked" : levels === 1 || level === 3 ? "is-gold" : level === 2 ? "is-silver" : "is-bronze");

const AchievementTile: React.FC<{ a: Profile["achievements"][number] }> = ({ a }) => {
  const { t, dateLocale } = useI18n();
  const done = a.level >= a.levels;
  const name = `${t(`game.ach.${a.key}` as MessageKey)}${a.levels > 1 && a.level ? ` ${ROMAN[a.level]}` : ""}`;
  return (
    <li className={cn("game-ach", medal(a.level, a.levels))} title={t(`game.achHint.${a.key}` as MessageKey)}>
      <span className="game-medal"><Icon name={ACH_ICON[a.key] ?? "sparkles"} size={18} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-fg">{name}</span>
        <span className="block text-xs text-fg-3">{t(`game.achHint.${a.key}` as MessageKey)}</span>
        {done ? (
          <span className="block text-xs text-accent">{a.earned_at ? t("game.earnedAt", { date: new Date(a.earned_at).toLocaleDateString(dateLocale) }) : t("game.earned")}</span>
        ) : (
          <>
            <span className="game-progress is-thin mt-1 block"><i style={{ width: `${Math.min(100, (a.value / a.target) * 100)}%` }} /></span>
            <span className="block text-[0.7rem] text-fg-3">{Math.min(a.value, a.target).toLocaleString(dateLocale)} / {a.target.toLocaleString(dateLocale)}</span>
          </>
        )}
      </span>
    </li>
  );
};
