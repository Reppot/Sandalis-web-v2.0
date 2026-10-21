"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { Scopes } from "@/entities/session";
import { CabinetWorkspace, LoginScreen, useSession } from "@/features/cabinet";
import { CodeBaseWorkspace } from "@/features/codes";
import { ReportsWorkspace } from "@/features/reports";
import { PyramidWorkspace, SupplyWorkspace } from "@/features/supply";
import { TerminalProvider, TimersWorkspace } from "@/features/timers";
import { ToolsWorkspace } from "@/features/tools";
import { TrainingWorkspace } from "@/features/training";
import { GuideWorkspace } from "@/features/guide";
import { ManagementWorkspace } from "@/features/management";
import { BackgroundLayer } from "@/app/_shell/BackgroundLayer";
import { Header } from "@/app/_shell/Header";
import { MobileNav, Sidebar } from "@/app/_shell/Navigation";
import { TABS, isTabKey, visibleTabs, type TabKey } from "@/app/_shell/tabs";
import { useT } from "@/shared";

export default function TerminalPage() {
  const t = useT();
  const { session, loading, setSession, can } = useSession();
  const { media } = useContent();
  const [tab, setTab] = React.useState<TabKey>("orders");
  const chromeRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // браузер не должен «восстанавливать» прокрутку старой страницы при перезагрузке
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  }, []);

  // высота шапки -> --chrome-h: меню и шапка вместе ровно в высоту окна, лишнего скролла нет
  React.useEffect(() => {
    const el = chromeRef.current;
    if (!el) return;
    const apply = () => document.documentElement.style.setProperty("--chrome-h", `${el.offsetHeight}px`);
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    return () => ro.disconnect();
  });

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

  const isOwner = session?.role === "owner" && session.subjectType === "user";
  const tabs = React.useMemo(() => visibleTabs(can, isOwner), [can, isOwner]);
  const current: TabKey = tabs.some((x) => x.key === tab) ? tab : tabs[0]?.key ?? "tools";

  const background = session ? media(`bg_${TABS.find((t) => t.key === current)?.background ?? "orders"}`) : media("bg_home");

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
    switch (current) {
      case "orders":
        return <SupplyWorkspace can={can} onReportSubmitted={() => select("reports")} />;
      case "pyramid":
        return <PyramidWorkspace can={can} onOpenConstructor={() => select("orders")} />;
      case "reports":
        return <ReportsWorkspace can={can} onOpenConstructor={() => select("orders")} />;
      case "timers":
        return <TimersWorkspace can={can} />;
      case "codes":
        return <CodeBaseWorkspace />;
      case "tools":
        return <ToolsWorkspace />;
      case "training":
        return <TrainingWorkspace />;
      case "guide":
        return <GuideWorkspace />;
      case "management":
        return <ManagementWorkspace />;
      case "cabinet":
        return <CabinetWorkspace />;
    }
  })();

  return (
    <TerminalProvider enabled={can(Scopes.TIMERS_READ)}>
      <BackgroundLayer src={background} />
      <div className="relative flex min-h-dvh flex-col gap-2.5 p-2.5 md:gap-3 md:p-3">
        <div ref={chromeRef} className="z-40 md:sticky md:top-0">
          <Header />
        </div>
        <div className="flex flex-1 items-start gap-2.5 md:gap-3">
          <Sidebar tabs={tabs} active={current} onSelect={select} />
          <main key={current} className="min-w-0 flex-1 pb-20 md:pb-0">{workspace}</main>
        </div>
        <MobileNav tabs={tabs} active={current} onSelect={select} />
      </div>
    </TerminalProvider>
  );
}
