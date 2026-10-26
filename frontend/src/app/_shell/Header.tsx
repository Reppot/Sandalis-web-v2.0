"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { Ticker, useClock, useRiskSummary, useTerminal } from "@/features/timers";
import { cn, formatClock, useT } from "@/shared";

/**
 * Верхняя панель: где вы находитесь (раздел › модуль), сводка складов бегущей строкой
 * и состояние связи. На телефоне — компактная шапка с гербом.
 */
export const Header: React.FC<{ section: string; page?: string | null; onHome: () => void }> = ({ section, page, onHome }) => {
  const t = useT();
  const { connection, lastSync } = useTerminal();
  const { media } = useContent();
  const risk = useRiskSummary();
  const now = useClock();
  const logo = media("clan_logo");

  const system =
    risk.critical > 0
      ? { label: t("header.alarm"), tone: "danger" }
      : risk.warning > 0
        ? { label: t("header.attention"), tone: "warning" }
        : { label: t("header.normal"), tone: "success" };

  const link =
    connection === "online"
      ? { label: t("header.online"), tone: "success", cls: "" }
      : connection === "syncing"
        ? { label: t("header.syncing"), tone: "warning", cls: "pulse" }
        : { label: t("header.offline"), tone: "danger", cls: "blink" };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button type="button" className="topbar-logo md:hidden" onClick={onHome} aria-label="SINDARIS">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt="" width={30} height={30} /> : <span className="title-brand text-sm">S</span>}
        </button>

        <nav className="topbar-crumbs" aria-label={t("header.breadcrumbs")}>
          {page ? (
            <>
              <span className="topbar-crumb is-parent">{section}</span>
              <span className="topbar-crumb-sep" aria-hidden>/</span>
              <span className="topbar-crumb">{page}</span>
            </>
          ) : (
            <span className="topbar-crumb">{section}</span>
          )}
        </nav>

        <div data-guide="shell-ticker" className="topbar-ticker">
          <Ticker />
        </div>

        <div data-guide="shell-status" className="topbar-status">
          <span className={cn("status-pill", `is-${link.tone}`)} title={t("header.link")}>
            <span className={cn("status-dot", link.cls)} />
            <span className="hidden sm:inline">{link.label}</span>
          </span>
          <span className={cn("status-pill hidden lg:inline-flex", `is-${system.tone}`)} title={t("header.system")}>
            <span className="status-dot" />
            {system.label}
          </span>
          <span className="status-time hidden xl:inline-flex" title={`${t("header.syncHint")}: ${formatClock(lastSync)}`}>
            {now ? formatClock(now) : "--:--:--"}
          </span>
        </div>
      </div>
    </header>
  );
};
