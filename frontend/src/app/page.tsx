"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { Scopes } from "@/entities/session";
import { CabinetWorkspace, LoginScreen, useSession } from "@/features/cabinet";
import { CodeBaseWorkspace } from "@/features/codes";
import { ReportsWorkspace } from "@/features/reports";
import { PyramidWorkspace, SupplyWorkspace } from "@/features/supply";
import { TerminalProvider, TimersWorkspace } from "@/features/timers";
import { ToolsWorkspace, type ToolModule } from "@/features/tools";
import { TrainingWorkspace } from "@/features/training";
import { GuideWorkspace } from "@/features/guide";
import { ManagementWorkspace } from "@/features/management";
import { BackgroundLayer } from "@/app/_shell/BackgroundLayer";
import { Header } from "@/app/_shell/Header";
import { MobileNav, Sidebar } from "@/app/_shell/Navigation";
import { TABS, isTabKey, isToolModule, visibleTabs, type TabKey } from "@/app/_shell/tabs";
import { useT } from "@/shared";

export default function TerminalPage() {
  const t = useT();
  const { session, loading, setSession, can } = useSession();
  const { media } = useContent();
  const [tab, setTab] = React.useState<TabKey>("tools");
  // открытый модуль «Инструментов» (?tab=tools&tool=...): заказы, пирамида, коды, калькуляторы
  const [tool, setTool] = React.useState<string | null>(null);
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
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("tab");
    if (isToolModule(requested)) {
      // старые ссылки ?tab=orders / pyramid / codes — теперь модули инструментов
      setTab("tools");
      setTool(requested);
    } else if (isTabKey(requested)) {
      setTab(requested);
      setTool(requested === "tools" ? params.get("tool") : null);
    }
  }, []);

  const select = React.useCallback((key: TabKey, nextTool: string | null = null) => {
    setTab(key);
    setTool(key === "tools" ? nextTool : null);
    const url = new URL(window.location.href);
    url.search = key === "tools" ? (nextTool ? `?tab=tools&tool=${nextTool}` : "") : `?tab=${key}`;
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
  }, []);
  const openTool = React.useCallback((id: string | null) => select("tools", id), [select]);

  const isOwner = session?.role === "owner" && session.subjectType === "user";
  const tabs = React.useMemo(() => visibleTabs(can, isOwner), [can, isOwner]);
  const current: TabKey = tabs.some((x) => x.key === tab) ? tab : tabs[0]?.key ?? "tools";

  const toolModules = React.useMemo<ToolModule[]>(
    () => [
      ...(can(Scopes.STOCKPILES_READ) || can(Scopes.REPORTS_CREATE)
        ? [{ id: "orders", icon: "orders" as const, label: "nav.orders.label" as const, clanData: true, render: () => <SupplyWorkspace can={can} onReportSubmitted={() => select("reports")} /> }]
        : []),
      ...(can(Scopes.STOCKPILES_READ)
        ? [{ id: "pyramid", icon: "pyramid" as const, label: "nav.pyramid.label" as const, clanData: true, isNew: true, render: () => <PyramidWorkspace can={can} onOpenConstructor={() => openTool("orders")} /> }]
        : []),
      { id: "codes", icon: "codes" as const, label: "nav.codes.label" as const, render: () => <CodeBaseWorkspace /> },
    ],
    [can, select, openTool],
  );

  const toolBg = tool === "orders" || tool === "pyramid" ? "orders" : tool === "codes" ? "codes" : null;
  const background = session ? media(`bg_${toolBg && current === "tools" ? toolBg : TABS.find((t) => t.key === current)?.background ?? "tools"}`) : media("bg_home");

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
      case "reports":
        return <ReportsWorkspace can={can} onOpenConstructor={() => openTool("orders")} />;
      case "timers":
        return <TimersWorkspace can={can} />;
      case "tools":
        return <ToolsWorkspace modules={toolModules} active={tool} onOpen={openTool} />;
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
