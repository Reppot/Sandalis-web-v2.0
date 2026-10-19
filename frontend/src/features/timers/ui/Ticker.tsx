"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { DAY, HOUR, formatCountdown, secondsLeft } from "@/shared";
import { timerPlace, useClock, useTerminal } from "@/features/timers/model";

interface Segment {
  text: string;
  tone: "critical" | "warning" | "safe";
}

const SPEED_PX_S = 70;
const PHRASE_CHANCE = 0.1;      // 10% в секунду — «радиоперехват» штаба
const PHRASE_HOLD_SECONDS = 12;

/** Бегущая строка: склады, которым осталось меньше суток, + фразы штаба из реестра контента. */
export const Ticker: React.FC = () => {
  const { timers, loading, connection } = useTerminal();
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
    const out: Segment[] = [];
    for (const t of timers) {
      if (t.completed_at || !now) continue;
      const ts = secondsLeft(t.ends_at, now);
      if (ts >= DAY) continue;
      const { region, location } = timerPlace(t);
      const where = region ? `${region} (${location})` : location;
      if (ts <= 0) {
        out.push({ text: `🔴 [ПОТЕРЯН] Склад ${where} — таймер истёк! Немедленно обновите удержание!`, tone: "critical" });
        continue;
      }
      const crit = ts < HOUR;
      out.push({ text: `${crit ? "🔴 [КРИТИЧЕСКИ]" : "🟠 [ВНИМАНИЕ]"} Склад ${where} пропадёт через ${formatCountdown(ts)}!`, tone: crit ? "critical" : "warning" });
    }
    if (phrase) out.push({ text: `🟢 ${phrase}`, tone: "safe" });
    if (loading) out.push({ text: "📡 ЗАГРУЗКА ВОЕННЫХ СПУТНИКОВ СЕКТОРА...", tone: "safe" });
    else if (connection === "offline") out.push({ text: "🔴 [СВЯЗЬ] ПОТЕРЯН КАНАЛ С БАЗОЙ СЕКТОРОВ — ПОВТОРНОЕ ПОДКЛЮЧЕНИЕ...", tone: "critical" });
    if (!out.length) out.push({ text: "🟢 ВСЕ СЕКТОРА СНАБЖЕНИЯ В ПОЛНОЙ БЕЗОПАСНОСТИ", tone: "safe" });
    return out;
  }, [timers, now, phrase, loading, connection]);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const copyRef = React.useRef<HTMLSpanElement>(null);
  const offset = React.useRef(0);
  const paused = React.useRef(false);
  const [minWidth, setMinWidth] = React.useState(0);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMinWidth(el.clientWidth));
    ro.observe(el);
    setMinWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(64, t - last);
      last = t;
      const copyW = copyRef.current?.offsetWidth ?? 0;
      if (copyW > 0 && !paused.current && !reduced) {
        offset.current -= (SPEED_PX_S * dt) / 1000;
        if (-offset.current >= copyW) offset.current += copyW;
      }
      if (trackRef.current) trackRef.current.style.transform = `translate3d(${offset.current.toFixed(2)}px,0,0)`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const renderCopy = (hidden: boolean) => (
    <span className="ticker-copy" ref={hidden ? undefined : copyRef} aria-hidden={hidden} style={{ minWidth: minWidth || undefined }}>
      {segments.map((s, i) => (
        <React.Fragment key={i}>
          <span className={`tk-${s.tone}`}>{s.text}</span>
          <span className="tk-sep">•</span>
        </React.Fragment>
      ))}
    </span>
  );

  return (
    <div
      ref={containerRef}
      className="ticker w-full"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      role="marquee"
      aria-label="Лента предупреждений"
    >
      <div ref={trackRef} className="ticker-track">
        {renderCopy(false)}
        {renderCopy(true)}
      </div>
    </div>
  );
};
