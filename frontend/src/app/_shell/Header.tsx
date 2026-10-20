"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { Ticker, useClock, useRiskSummary, useTerminal } from "@/features/timers";
import { formatClock, useT } from "@/shared";

/** Шапка терминала: герб, бегущая строка, статусы связи/системы/синхронизации/времени. */
export const Header: React.FC = () => {
  const t = useT();
  const { connection, lastSync } = useTerminal();
  const { media } = useContent();
  const risk = useRiskSummary();
  const now = useClock();
  const logo = media("clan_logo");

  const system =
    risk.critical > 0
      ? { label: t("header.alarm"), color: "var(--tk-critical)" }
      : risk.warning > 0
        ? { label: t("header.attention"), color: "var(--tk-warning)" }
        : { label: t("header.normal"), color: "var(--tk-safe)" };

  const link =
    connection === "online"
      ? { label: t("header.online"), color: "var(--tk-safe)", cls: "" }
      : connection === "syncing"
        ? { label: t("header.syncing"), color: "var(--tk-warning)", cls: "pulse" }
        : { label: t("header.offline"), color: "var(--tk-critical)", cls: "blink" };

  return (
    <header className="chrome relative rounded-md px-3 py-2 md:px-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 xl:grid-cols-[auto_minmax(320px,1fr)_auto]">
        <div data-guide="shell-brand" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt={t("common.crest")} width={44} height={44} className="ui-icon crest-frame h-11 w-11 rounded-md object-cover" />}
          <div className="leading-none">
            <div className="flex items-baseline gap-2">
              <span className="title-brand text-[1.15rem] md:text-[1.35rem]">SINDARIS</span>
              <span className="hidden font-display text-[0.8rem] tracking-[0.18em] uppercase opacity-85 sm:inline">{t("header.terminal")}</span>
            </div>
            <div className="hud-label chrome-muted mt-1 hidden sm:block">Logistics Overwatch Control • Foxhole</div>
          </div>
        </div>

        <div data-guide="shell-ticker" className="order-3 col-span-2 w-full min-w-0 xl:order-none xl:col-span-1">
          <Ticker />
        </div>

        <div data-guide="shell-status" className="flex items-center justify-end gap-2 md:gap-3">
          <StatusChip label={t("header.link")} value={link.label} color={link.color} dotClass={link.cls} />
          <StatusChip label={t("header.system")} value={system.label} color={system.color} className="hidden sm:flex" />
          <StatusChip label={t("header.sync")} value={formatClock(lastSync)} color="var(--tk-safe)" mono className="hidden md:flex" title={t("header.syncHint")} />
          <StatusChip label={t("header.time")} value={now ? formatClock(now) : "--:--:--"} color="var(--chrome-text)" mono className="hidden 2xl:flex" />
        </div>
      </div>
    </header>
  );
};

const StatusChip: React.FC<{ label: string; value: string; color: string; dotClass?: string; mono?: boolean; className?: string; title?: string }> = ({ label, value, color, dotClass = "", mono = false, className = "", title }) => (
  <div className={`items-center gap-2 rounded border px-2 py-1 ${className || "flex"}`} style={{ borderColor: "var(--chrome-border)", background: "rgba(0,0,0,0.12)" }} title={title}>
    <span className={`status-dot ${dotClass}`} style={{ color, background: color }} />
    <span className="hud-label chrome-muted">{label}</span>
    <span className={`text-[0.7rem] font-bold tracking-wider ${mono ? "font-mono tabular-nums" : ""}`} style={{ color }}>
      {value}
    </span>
  </div>
);
