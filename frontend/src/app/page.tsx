"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { Scopes } from "@/entities/session";
import { CabinetWorkspace, LoginScreen, useSession } from "@/features/cabinet";
import { CodeBaseWorkspace } from "@/features/codes";
import { ReportsWorkspace } from "@/features/reports";
import { SupplyWorkspace } from "@/features/supply";
import { TerminalProvider, TimersWorkspace } from "@/features/timers";
import { ToolsWorkspace } from "@/features/tools";
import { TrainingWorkspace } from "@/features/training";
import { BackgroundLayer } from "@/app/_shell/BackgroundLayer";
import { Header } from "@/app/_shell/Header";
import { MobileNav, Sidebar } from "@/app/_shell/Navigation";
import { TABS, isTabKey, type TabKey } from "@/app/_shell/tabs";
import { useT } from "@/shared";

export default function TerminalPage() {
  const t = useT();
  const { session, loading, setSession, can } = useSession();
  const { media } = useContent();
  const [tab, setTab] = React.useState<TabKey>("orders");

  React.useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (isTabKey(requested)) setTab(requested);
  }, []);

  const select = React.useCallback((key: TabKey) => {
    setTab(key);
    const url = new URL(window.location.href);
    url.search = key === "orders" ? "" : `?tab=${key}`;
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
  }, []);

  const background = session ? media(`bg_${TABS.find((t) => t.key === tab)?.background ?? "orders"}`) : media("bg_home");

  if (loading) {
    return (
      <>
        <BackgroundLayer src={media("bg_home")} />
        <div className="hud-label flex min-h-dvh items-center justify-center text-muted">
          <span className="pulse">{t("app.connecting")}</span>
        </div>
      </>
    );
  }

  if (!session) return <LoginScreen onLoggedIn={setSession} />;

  const workspace = (() => {
    switch (tab) {
      case "orders":
        return <SupplyWorkspace canWriteStockpiles={can(Scopes.STOCKPILES_WRITE)} canWriteOrders={can(Scopes.ORDERS_WRITE)} onReportSubmitted={() => select("reports")} />;
      case "reports":
        return <ReportsWorkspace canWrite={can(Scopes.ORDERS_WRITE)} canDelete={can(Scopes.ORDERS_DELETE)} onOpenConstructor={() => select("orders")} />;
      case "timers":
        return <TimersWorkspace canWrite={can(Scopes.TIMERS_WRITE, Scopes.STOCKPILES_WRITE)} />;
      case "codes":
        return <CodeBaseWorkspace />;
      case "tools":
        return <ToolsWorkspace />;
      case "training":
        return <TrainingWorkspace />;
      case "cabinet":
        return <CabinetWorkspace />;
    }
  })();

  return (
    <TerminalProvider enabled={can(Scopes.TIMERS_READ)}>
      <BackgroundLayer src={background} />
      <div className="relative flex min-h-dvh flex-col gap-2.5 p-2.5 md:gap-3 md:p-3">
        <Header />
        <div className="flex flex-1 items-start gap-2.5 md:gap-3">
          <Sidebar active={tab} onSelect={select} />
          <main key={tab} className="min-w-0 flex-1 pb-20 md:pb-0">{workspace}</main>
        </div>
        <MobileNav active={tab} onSelect={select} />
      </div>
    </TerminalProvider>
  );
}
