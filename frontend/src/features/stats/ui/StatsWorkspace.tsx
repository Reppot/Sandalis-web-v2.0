"use client";

import * as React from "react";
import { ClanStrip, GameSettingsView, HallOfFame } from "@/features/stats/ui/ClanGame";
import { LeaderboardView, ProfileView } from "@/features/stats/ui/GameViews";
import { gameClanApi, type Summary } from "@/features/stats/model/game";
import { LeagueMark } from "@/features/stats/ui/LeagueBanner";
import { EmptyState, Loading, PageHeader, Segmented, SheetHead, apiClient, errorText, formatDateTime, sortRows, useI18n, useNotify, type MessageKey, type SheetSort } from "@/shared";

interface MemberStats {
  user_id: string;
  name: string;
  role: string;
  orders_created: number;
  deliveries: number;
  delivered_qty: number;
  timers_started: number;
  timer_notes: number;
  last_active: string | null;
}

interface ClanStats {
  period_days: number;
  members_total: number;
  active_members: number;
  orders_total: number;
  orders_by_status: Record<string, number>;
  deliveries: number;
  delivered_qty: number;
  timers_active: number;
  stockpiles: number;
  members: MemberStats[];
  activity: { date: string; orders: number; deliveries: number }[];
  top_items: { name: string; item_code: string | null; quantity: number }[];
}

const statsApi = {
  get: (days: number) => apiClient.get<ClanStats>("/api/v1/clan/stats", { params: { days } }),
};

const ROLE: Record<string, MessageKey> = { owner: "role.owner", admin: "role.admin", officer: "role.officer", member: "role.member", guest: "role.guest", former: "stats.former" };
const PERIODS = ["7", "30", "90", "0"] as const;

type Tab = "overview" | "rating" | "profile" | "settings";

/** «Статистика»: обзор клана, рейтинг по очкам снабжения и профиль бойца (лига, очки, вклад). */
export const StatsWorkspace: React.FC<{ userId: string; isOwner: boolean }> = ({ userId, isOwner }) => {
  const { t } = useI18n();
  const [tab, setTab] = React.useState<Tab>("overview");
  const [profileOf, setProfileOf] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const loadSummary = React.useCallback(() => {
    gameClanApi.summary().then(setSummary).catch(() => setSummary(null));
  }, []);
  React.useEffect(loadSummary, [loadSummary]);
  const game = summary?.enabled !== false;
  const open = (id: string) => {
    setProfileOf(id);
    setTab("profile");
  };
  return (
    <div className="tab-fade flex flex-col gap-4">
      <Segmented
        size="lg"
        label={t("stats.title")}
        value={tab}
        onChange={(v) => {
          setTab(v);
          if (v === "profile") setProfileOf(null);
        }}
        options={[
          { value: "overview" as Tab, label: t("stats.tab.overview") },
          ...(game ? [{ value: "rating" as Tab, label: t("stats.tab.rating") }, { value: "profile" as Tab, label: t("stats.tab.profile") }] : []),
          ...(isOwner ? [{ value: "settings" as Tab, label: t("stats.tab.settings") }] : []),
        ]}
      />
      {tab === "overview" || (!game && (tab === "rating" || tab === "profile")) ? (
        <Overview onOpen={open} />
      ) : tab === "settings" ? (
        <GameSettingsView onSaved={loadSummary} />
      ) : tab === "rating" ? (
        <>
          {summary ? <ClanStrip summary={summary} /> : null}
          <LeaderboardView myId={userId} onOpen={open} />
          {summary ? <HallOfFame summary={summary} onOpen={open} /> : null}
        </>
      ) : (
        <ProfileView key={profileOf ?? userId} userId={profileOf ?? userId} myId={userId} onBack={profileOf && profileOf !== userId ? () => setTab("rating") : undefined} />
      )}
    </div>
  );
};

/** Обзор: вклад участников клана — заказы, доставки, таймеры — за выбранный период. */
const Overview: React.FC<{ onOpen: (userId: string) => void }> = ({ onOpen }) => {
  const { t, dateLocale } = useI18n();
  const notify = useNotify();
  const [days, setDays] = React.useState<(typeof PERIODS)[number]>("30");
  const [data, setData] = React.useState<ClanStats | null>(null);
  const [sort, setSort] = React.useState<SheetSort | null>(null);

  React.useEffect(() => {
    setData(null);
    statsApi
      .get(Number(days))
      .then(setData)
      .catch((err) => notify({ title: t("stats.title"), message: errorText(err, t("stats.loadFailed")), tone: "danger" }));
  }, [days, notify, t]);

  const num = (n: number) => n.toLocaleString(dateLocale);
  const people = React.useMemo(
    () =>
      data
        ? sortRows(data.members, sort, (m, key) =>
            key === "name" ? m.name : key === "last" ? (m.last_active ? Date.parse(m.last_active) : 0) : (m[key as keyof MemberStats] as number),
          )
        : [],
    [data, sort],
  );
  const maxDay = data ? Math.max(1, ...data.activity.map((d) => d.orders + d.deliveries)) : 1;
  const maxItem = data?.top_items[0]?.quantity ?? 1;
  const maxQty = Math.max(1, ...people.map((m) => m.delivered_qty));

  return (
    <div className="tab-fade flex flex-col gap-4">
      <PageHeader
        icon="stats"
        eyebrow={t("stats.kicker")}
        title={t("stats.title")}
        lead={t("stats.lead")}
        actions={
          <Segmented
            label={t("stats.period")}
            value={days}
            onChange={setDays}
            options={PERIODS.map((p) => ({ value: p, label: p === "0" ? t("stats.allTime") : t("stats.days", { n: p }) }))}
          />
        }
      />

      {!data ? (
        <div className="panel"><Loading /></div>
      ) : (
        <>
          <section className="stats-kpis">
            <Kpi value={`${data.active_members} / ${data.members_total}`} label={t("stats.activeMembers")} />
            <Kpi value={num(data.orders_total)} label={t("stats.orders")} hint={t("stats.ordersHint", { done: data.orders_by_status.done ?? 0, open: (data.orders_by_status.open ?? 0) + (data.orders_by_status.in_progress ?? 0) })} />
            <Kpi value={num(data.deliveries)} label={t("stats.deliveries")} />
            <Kpi value={num(data.delivered_qty)} label={t("stats.deliveredQty")} accent />
            <Kpi value={num(data.timers_active)} label={t("stats.timersActive")} hint={t("stats.stockpiles", { n: data.stockpiles })} />
          </section>

          <section className="panel p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="panel-title">{t("stats.activity")}</h2>
              <span className="flex items-center gap-3 text-xs text-fg-3">
                <span className="flex items-center gap-1.5"><i className="stats-dot is-orders" />{t("stats.legendOrders")}</span>
                <span className="flex items-center gap-1.5"><i className="stats-dot is-deliveries" />{t("stats.legendDeliveries")}</span>
              </span>
            </div>
            <div className="stats-chart" role="img" aria-label={t("stats.activity")}>
              {data.activity.map((d) => (
                <div key={d.date} className="stats-bar" title={`${new Date(d.date).toLocaleDateString(dateLocale)} — ${t("stats.legendOrders")}: ${d.orders}, ${t("stats.legendDeliveries")}: ${d.deliveries}`}>
                  <span className="stats-bar-stack" style={{ height: `${((d.orders + d.deliveries) / maxDay) * 100}%` }}>
                    <span className="is-deliveries" style={{ flexGrow: d.deliveries }} />
                    <span className="is-orders" style={{ flexGrow: d.orders }} />
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[0.7rem] text-fg-3">
              <span>{new Date(data.activity[0].date).toLocaleDateString(dateLocale)}</span>
              <span>{t("stats.today")}</span>
            </div>
          </section>

          <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
            <section className="panel overflow-hidden">
              <div className="border-b border-line px-5 py-4">
                <h2 className="panel-title">{t("stats.members")}</h2>
                <p className="mt-0.5 text-xs text-fg-3">{t("stats.membersHint")}</p>
              </div>
              {people.length ? (
                <div className="scroll-area overflow-x-auto">
                  <table className="data-table min-w-[760px]">
                    <thead>
                      <tr>
                        <th className="w-10 px-4 py-3">#</th>
                        <SheetHead label={t("stats.col.name")} sortKey="name" sort={sort} onSort={setSort} />
                        <SheetHead label={t("stats.col.delivered")} sortKey="delivered_qty" sort={sort} onSort={setSort} />
                        <SheetHead label={t("stats.col.deliveries")} sortKey="deliveries" sort={sort} onSort={setSort} />
                        <SheetHead label={t("stats.col.orders")} sortKey="orders_created" sort={sort} onSort={setSort} />
                        <SheetHead label={t("stats.col.timers")} sortKey="timers_started" sort={sort} onSort={setSort} />
                        <SheetHead label={t("stats.col.notes")} sortKey="timer_notes" sort={sort} onSort={setSort} />
                        <SheetHead label={t("stats.col.last")} sortKey="last" sort={sort} onSort={setSort} />
                      </tr>
                    </thead>
                    <tbody>
                      {people.map((m, i) => (
                        <tr key={m.user_id}>
                          <td className="px-4 py-2.5 text-xs text-fg-3 tabular">{i + 1}</td>
                          <td className="px-3 py-2.5">
                            <button type="button" className="flex items-center gap-1.5 font-medium text-fg hover:underline" onClick={() => onOpen(m.user_id)}>
                              <LeagueMark userId={m.user_id} />
                              {m.name}
                            </button>
                            <span className="block text-xs text-fg-3">{ROLE[m.role] ? t(ROLE[m.role]) : m.role}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="flex items-center gap-2">
                              <span className="stats-meter"><span style={{ width: `${(m.delivered_qty / maxQty) * 100}%` }} /></span>
                              <b className="tabular">{num(m.delivered_qty)}</b>
                            </span>
                          </td>
                          <td className="px-3 py-2.5 tabular">{num(m.deliveries)}</td>
                          <td className="px-3 py-2.5 tabular">{num(m.orders_created)}</td>
                          <td className="px-3 py-2.5 tabular">{num(m.timers_started)}</td>
                          <td className="px-3 py-2.5 tabular">{num(m.timer_notes)}</td>
                          <td className="px-3 py-2.5 text-xs text-fg-3">{m.last_active ? formatDateTime(m.last_active) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState icon="stats" title={t("stats.empty")} />
              )}
            </section>

            <section className="panel p-5">
              <h2 className="panel-title">{t("stats.topItems")}</h2>
              <p className="mt-0.5 text-xs text-fg-3">{t("stats.topItemsHint")}</p>
              {data.top_items.length ? (
                <ol className="mt-4 flex flex-col gap-2.5">
                  {data.top_items.map((it, i) => (
                    <li key={`${it.name}-${i}`} className="stats-top">
                      <span className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate">{it.name}</span>
                        <b className="shrink-0 tabular">{num(it.quantity)}</b>
                      </span>
                      <span className="stats-meter mt-1 w-full"><span style={{ width: `${(it.quantity / maxItem) * 100}%` }} /></span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-6 text-sm text-fg-3">{t("stats.noDeliveries")}</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
};

const Kpi: React.FC<{ value: string; label: string; hint?: string; accent?: boolean }> = ({ value, label, hint, accent }) => (
  <div className="panel stats-kpi">
    <span className={`stats-kpi-value ${accent ? "text-accent" : ""}`}>{value}</span>
    <span className="stats-kpi-label">{label}</span>
    {hint ? <span className="stats-kpi-hint">{hint}</span> : null}
  </div>
);
