"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { Scopes, type Can } from "@/entities/session";
import { EmptyState, Loading, formatCountdown, formatDateTime, secondsLeft, severityOf, timeUnits, UiGlyph, useT } from "@/shared";
import { timerPlace, useClock, useRiskSummary, useTerminal, type MonitoredTimer } from "@/features/timers/model";
import { RegisterTimerModal, TimerManagerModal } from "@/features/timers/ui/TimerModals";

const BAR = { critical: "#ff5555", warning: "#ff9900", safe: "#a3e635" } as const;

export const TimersWorkspace: React.FC<{ can: Can }> = ({ can }) => {
  const canCreate = can(Scopes.TIMERS_CREATE);
  const t = useT();
  const { timers, loading, refresh, connection } = useTerminal();
  const risk = useRiskSummary();
  const now = useClock();
  const [managedId, setManagedId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return timers.filter((t) => {
      if (!q) return true;
      const { region, location } = timerPlace(t);
      return `${region ?? ""} ${location}`.toLowerCase().includes(q);
    });
  }, [timers, query]);

  const managed = managedId ? timers.find((t) => t.id === managedId) ?? null : null;

  return (
    <div className="tab-fade flex flex-col gap-2.5 md:gap-3">
      <section className="panel panel-corners rounded-md px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <UiGlyph icon="timers" size={30} />
            <h2 className="panel-title">{t("timers.title")}</h2>
          </div>
          <Stat guide="timers-stats" label={`🚨 ${t("timers.critical")}`} value={risk.critical} color="var(--danger)" />
          <Stat label={`⚠️ ${t("timers.warning")}`} value={risk.warning} color="var(--warn)" />
          <Stat label={`✅ ${t("timers.safe")}`} value={risk.safe} color="var(--tk-safe)" />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input className="field w-40 py-1.5 text-xs" data-guide="timers-search" placeholder={t("timers.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="btn" onClick={() => void refresh()} title={t("common.syncHint")}>
              ⟳ <span className="hidden sm:inline">{t("common.sync")}</span>
            </button>
            {canCreate && (
              <button className="btn btn-primary" data-guide="timers-register" onClick={() => setAdding(true)}>
                ➕ <span className="hidden sm:inline">{t("timers.register")}</span>
                <span className="sm:hidden">{t("timers.registerShort")}</span>
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="pr-0.5">
        {loading ? (
          <div className="panel rounded-md"><Loading label={t("timers.loading")} /></div>
        ) : visible.length === 0 ? (
          <div className="panel panel-corners rounded-md">
            <EmptyState icon="stockpile" title={timers.length ? t("common.nothingFound") : t("timers.empty")} hint={canCreate ? undefined : t("timers.officersOnly")}>
              {connection === "offline" && <div className="hud-label text-danger">{t("common.noDb")}</div>}
            </EmptyState>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {visible.map((t) => (
              <TimerCard key={t.id} timer={t} now={now} onManage={() => setManagedId(t.id)} />
            ))}
          </ul>
        )}
      </section>

      {managed && <TimerManagerModal timer={managed} can={can} onClose={() => setManagedId(null)} />}
      <RegisterTimerModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; color: string; guide?: string }> = ({ label, value, color, guide }) => {
  const t = useT();
  return (
  <div data-guide={guide} className="flex items-center gap-2 font-mono text-[0.72rem] font-bold tracking-wide" style={{ color }}>
    <span>{label}:</span>
    <span className="rounded border px-1.5 py-0.5 tabular-nums" style={{ borderColor: color, background: "rgba(0,0,0,0.3)" }}>
      {t("timers.bases", { n: value })}
    </span>
  </div>
  );
};

const TimerCard: React.FC<{ timer: MonitoredTimer; now: number; onManage: () => void }> = ({ timer, now, onManage }) => {
  const t = useT();
  const { media } = useContent();
  const ts = secondsLeft(timer.ends_at, now || Date.now());
  const done = Boolean(timer.completed_at);
  const sev = done ? "safe" : severityOf(ts);
  const pct = Math.max(0, Math.min(100, (ts / Math.max(1, timer.duration_seconds)) * 100));
  const { region, location } = timerPlace(timer);
  const card = media("bg_card");
  return (
    <li
      className={`timer-card sev-${sev} ${done ? "opacity-60" : ""}`}
      style={card ? { backgroundImage: `linear-gradient(90deg, var(--card-bg), var(--card-bg)), url(${card})` } : undefined}
    >
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-5 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[0.95rem] font-bold text-white">
            <span>📍</span>
            {region && (
              <>
                <span className="truncate tracking-wide uppercase">{region}</span>
                <span className="opacity-60">▶</span>
              </>
            )}
            <span className="truncate">{location}</span>
          </div>
          <div className="progress-track mt-2 max-w-md">
            <div className="progress-bar" style={{ width: `${done ? 100 : pct}%`, background: BAR[sev], boxShadow: `0 0 10px ${BAR[sev]}` }} />
          </div>
          <div className="hud-label mt-1.5 truncate text-white/60">
            {timer.note ? timer.note : t("timers.endsAt", { at: formatDateTime(timer.ends_at) })}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <div data-guide="timer-left" className="text-right">
            <div className="hud-label text-white/60">{done ? t("timers.completed") : ts > 0 ? t(sev === "critical" ? "timers.sevCritical" : sev === "warning" ? "timers.sevWarning" : "timers.sevSafe") : t("timers.timerExpired")}</div>
            <div className={`timer-value ${sev === "critical" && ts > 0 && !done ? "pulse" : ""}`}>{done ? "—" : ts > 0 ? formatCountdown(ts, timeUnits(t)) : "00:00:00"}</div>
          </div>
          <button className="btn h-[34px] min-w-[110px]" data-guide="timer-manage" onClick={onManage}>{t("timers.manage")}</button>
        </div>
      </div>
    </li>
  );
};
