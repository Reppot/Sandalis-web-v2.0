"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { DAY, HOUR, cn, formatCountdown, secondsLeft, timeUnits, useT } from "@/shared";
import { timerPlace, useClock, useTerminal } from "@/features/timers/model";

interface Segment {
  key: string;
  text: string;
  tone: "critical" | "warning" | "safe" | "info";
}

const SPEED_PX_S = 45;
const GAP_PX = 40;              // расстояние между копиями ленты
const PHRASE_CHANCE = 0.1;      // 10% в секунду — «радиоперехват» штаба
const PHRASE_HOLD_SECONDS = 12;

/**
 * Лента предупреждений в верхней панели: склады, которым осталось меньше суток, затем
 * фразы штаба из реестра контента. Помещается — стоит на месте; не помещается — плавно
 * прокручивается (пауза при наведении, без анимации при prefers-reduced-motion).
 * Есть тревоги и onOpen — клик ведёт к складам клана.
 */
export const Ticker: React.FC<{ onOpen?: () => void }> = ({ onOpen }) => {
  const t = useT();
  const { timers, loading, connection, enabled } = useTerminal();
  const { list } = useContent();
  const now = useClock();
  const [phrase, setPhrase] = React.useState("");
  const phraseState = React.useRef({ hold: 0, lastTick: 0 });
  const phrases = React.useMemo(() => list<{ text: string }>("ticker_phrase").map((p) => p.payload.text), [list]);

  React.useEffect(() => {
    if (!now) return;
    const st = phraseState.current;
    const tick = Math.floor(now / 1000);
    if (tick === st.lastTick) return;
    st.lastTick = tick;
    if (st.hold > 0) {
      st.hold -= 1;
      if (st.hold === 0) setPhrase("");
    } else if (phrases.length && Math.random() < PHRASE_CHANCE) {
      st.hold = PHRASE_HOLD_SECONDS;
      setPhrase(phrases[Math.floor(Math.random() * phrases.length)]);
    }
  }, [now, phrases]);

  const segments = React.useMemo<Segment[]>(() => {
    const units = timeUnits(t);
    const alerts: (Segment & { left: number })[] = [];
    for (const timer of timers) {
      if (timer.completed_at || !now) continue;
      const ts = secondsLeft(timer.ends_at, now);
      if (ts >= DAY) continue;
      const { region, location } = timerPlace(timer);
      const where = region ? `${region} (${location})` : location;
      if (ts <= 0) alerts.push({ key: timer.id, text: t("ticker.lost", { where }), tone: "critical", left: ts });
      else alerts.push({ key: timer.id, text: t(ts < HOUR ? "ticker.critical" : "ticker.warning", { where, left: formatCountdown(ts, units) }), tone: ts < HOUR ? "critical" : "warning", left: ts });
    }
    // самое срочное — первым
    const out: Segment[] = alerts.sort((a, b) => a.left - b.left).map(({ key, text, tone }) => ({ key, text, tone }));
    if (loading) out.push({ key: "loading", text: t("ticker.loading"), tone: "info" });
    else if (connection === "offline") out.unshift({ key: "offline", text: t("ticker.offline"), tone: "critical" });
    if (phrase) out.push({ key: "phrase", text: phrase, tone: "info" });
    // «все склады в безопасности» — только тем, кто видит склады клана
    if (!out.length) out.push({ key: "safe", text: enabled ? t("ticker.allSafe") : t("ticker.guest"), tone: "safe" });
    return out;
  }, [timers, now, phrase, loading, connection, enabled, t]);

  const alarm = segments.some((s) => s.tone === "critical" || s.tone === "warning");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const copyRef = React.useRef<HTMLSpanElement>(null);
  const offset = React.useRef(0);
  const paused = React.useRef(false);
  const [overflow, setOverflow] = React.useState(false);

  // прокрутка нужна, только если лента не помещается в капсулу
  React.useLayoutEffect(() => {
    const measure = () => {
      const box = containerRef.current;
      const copy = copyRef.current;
      if (box && copy) setOverflow(copy.scrollWidth > box.clientWidth - 24);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    if (copyRef.current) ro.observe(copyRef.current);
    return () => ro.disconnect();
  }, [segments]);

  React.useEffect(() => {
    offset.current = 0;
    if (trackRef.current) trackRef.current.style.transform = "translate3d(0,0,0)";
    if (!overflow || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last = performance.now();
    const step = (time: number) => {
      const dt = Math.min(64, time - last);
      last = time;
      const loop = (copyRef.current?.offsetWidth ?? 0) + GAP_PX;
      if (loop > GAP_PX && !paused.current) {
        offset.current -= (SPEED_PX_S * dt) / 1000;
        if (-offset.current >= loop) offset.current += loop;
      }
      if (trackRef.current) trackRef.current.style.transform = `translate3d(${offset.current.toFixed(2)}px,0,0)`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [overflow]);

  const renderCopy = (hidden: boolean) => (
    <span className="ticker-copy" ref={hidden ? undefined : copyRef} aria-hidden={hidden || undefined}>
      {segments.map((s) => (
        <span key={s.key} className={`ticker-item tk-${s.tone}`}>
          <i className="ticker-dot" aria-hidden />
          {s.text}
        </span>
      ))}
    </span>
  );

  const clickable = Boolean(onOpen && alarm);
  return (
    <div
      ref={containerRef}
      className={cn("ticker w-full", overflow && "is-moving", clickable && "is-clickable")}
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onClick={clickable ? onOpen : undefined}
      role={clickable ? "button" : "status"}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => (e.key === "Enter" || e.key === " ") && onOpen?.() : undefined}
      aria-label={t("ticker.aria")}
      aria-live="polite"
    >
      <div ref={trackRef} className="ticker-track" style={{ gap: GAP_PX }}>
        {renderCopy(false)}
        {overflow ? renderCopy(true) : null}
      </div>
    </div>
  );
};
