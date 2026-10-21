"use client";

import * as React from "react";
import { clanApi, type ClanProfile } from "@/entities/clan";
import { useContent } from "@/entities/content";
import { Scopes } from "@/entities/session";
import { CabinetWorkspace, LoginScreen, useSession } from "@/features/cabinet";
import { CodeBaseWorkspace } from "@/features/codes";
import { ReportsWorkspace } from "@/features/reports";
import { ClanStockpiles, PyramidWorkspace, SupplyWorkspace } from "@/features/supply";
import { TerminalProvider, TimersWorkspace } from "@/features/timers";
import { ToolsWorkspace, type ToolModule } from "@/features/tools";
import { TrainingWorkspace } from "@/features/training";
import { GuideWorkspace } from "@/features/guide";
import { ManagementWorkspace } from "@/features/management";
import { BackgroundLayer } from "@/app/_shell/BackgroundLayer";
import { ClanWorkspace, type ClanSection } from "@/app/_shell/ClanWorkspace";
import { Header } from "@/app/_shell/Header";
import { MobileNav, Sidebar } from "@/app/_shell/Navigation";
import { TABS, isClanView, isTabKey, isToolModule, legacyClanView, visibleTabs, type ClanView, type TabKey } from "@/app/_shell/tabs";
import { useT } from "@/shared";

export default function TerminalPage() {
  const t = useT();
  const { session, loading, setSession, can } = useSession();
  const { media } = useContent();
  const [tab, setTab] = React.useState<TabKey>("tools");
  // открытый модуль «Инструментов» (?tab=tools&tool=...): заказы, пирамида, коды, калькуляторы
  const [tool, setTool] = React.useState<string | null>(null);
  // подраздел «Вашего клана» (?tab=clan&view=...): заказы, склады, обучение, управление
  const [clanView, setClanView] = React.useState<ClanView>("reports");
  const [clan, setClan] = React.useState<ClanProfile | null>(null);
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
    const legacy = legacyClanView(requested);
    if (isToolModule(requested)) {
      // старые ссылки ?tab=orders / pyramid / codes — теперь модули инструментов
      setTab("tools");
      setTool(requested);
    } else if (legacy) {
      // старые ссылки ?tab=reports / timers / training / management — подразделы «Вашего клана»
      setTab("clan");
      setClanView(legacy);
    } else if (isTabKey(requested)) {
      setTab(requested);
      if (requested === "tools") setTool(params.get("tool"));
      const view = params.get("view");
      if (requested === "clan" && isClanView(view)) setClanView(view);
    }
  }, []);

  /** sub — модуль инструментов или подраздел клана; живёт в адресе страницы. */
  const select = React.useCallback((key: TabKey, sub: string | null = null) => {
    setTab(key);
    setTool(key === "tools" ? sub : null);
    if (key === "clan" && isClanView(sub)) setClanView(sub);
    const url = new URL(window.location.href);
    url.search =
      key === "tools" ? (sub ? `?tab=tools&tool=${sub}` : "") : key === "clan" && sub ? `?tab=clan&view=${sub}` : `?tab=${key}`;
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
  }, []);
  const openTool = React.useCallback((id: string | null) => select("tools", id), [select]);
  const openClan = React.useCallback((view: ClanView) => select("clan", view), [select]);

  const isOwner = session?.role === "owner" && session.subjectType === "user";
  const isGuest = session?.subjectType === "guest";
  const tabs = React.useMemo(() => visibleTabs(can, isGuest), [can, isGuest]);

  React.useEffect(() => {
    if (!session || isGuest) return setClan(null);
    clanApi.profile().then(setClan).catch(() => setClan(null));
  }, [session, isGuest]);
  const current: TabKey = tabs.some((x) => x.key === tab) ? tab : tabs[0]?.key ?? "tools";

  const toolModules = React.useMemo<ToolModule[]>(
    () => [
      ...(can(Scopes.STOCKPILES_READ) || can(Scopes.REPORTS_CREATE)
        ? [{ id: "orders", icon: "orders" as const, label: "nav.orders.label" as const, clanData: true, render: () => <SupplyWorkspace can={can} onReportSubmitted={() => openClan("reports")} /> }]
        : []),
      ...(can(Scopes.STOCKPILES_READ)
        ? [{ id: "pyramid", icon: "pyramid" as const, label: "nav.pyramid.label" as const, clanData: true, isNew: true, render: () => <PyramidWorkspace can={can} onOpenConstructor={() => openTool("orders")} /> }]
        : []),
      { id: "codes", icon: "codes" as const, label: "nav.codes.label" as const, render: () => <CodeBaseWorkspace /> },
    ],
    [can, openClan, openTool],
  );

  const clanSections = React.useMemo<ClanSection[]>(
    () => [
      ...(can(Scopes.REPORTS_READ)
        ? [{ view: "reports" as const, icon: "reports" as const, label: "nav.reports.label" as const, hint: "nav.reports.hint" as const, render: () => <ReportsWorkspace can={can} onOpenConstructor={() => openTool("orders")} /> }]
        : []),
      ...(can(Scopes.STOCKPILES_READ) || can(Scopes.TIMERS_READ)
        ? [{
            view: "stockpiles" as const, icon: "stockpile" as const, label: "clan.stockpilesTitle" as const, hint: "clan.stockpilesNav" as const,
            render: () => (
              <div className="flex flex-col gap-3">
                {can(Scopes.STOCKPILES_READ) ? <ClanStockpiles can={can} /> : null}
                {can(Scopes.TIMERS_READ) ? <TimersWorkspace can={can} /> : null}
              </div>
            ),
          }]
        : []),
      { view: "training" as const, icon: "training" as const, label: "nav.training.label" as const, hint: "nav.training.hint" as const, render: () => <TrainingWorkspace /> },
      ...(isOwner
        ? [{ view: "management" as const, icon: "map" as const, label: "nav.management.label" as const, hint: "nav.management.hint" as const, render: () => <ManagementWorkspace /> }]
        : []),
    ],
    [can, isOwner, openTool],
  );
  const clanBg: Record<ClanView, string> = { reports: "reports", stockpiles: "timers", training: "training", management: "cabinet" };

  const toolBg = tool === "orders" || tool === "pyramid" ? "orders" : tool === "codes" ? "codes" : null;
  const tabBg = current === "tools" && toolBg ? toolBg : current === "clan" ? clanBg[clanView] : TABS.find((t) => t.key === current)?.background ?? "tools";
  const background = session ? media(`bg_${tabBg}`) : media("bg_home");

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
      case "clan":
        return <ClanWorkspace profile={clan} role={session.role} sections={clanSections} view={clanView} onView={openClan} />;
      case "tools":
        return <ToolsWorkspace modules={toolModules} active={tool} onOpen={openTool} />;
      case "guide":
        return <GuideWorkspace />;
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
          <Sidebar tabs={tabs} active={current} onSelect={select} clan={clan} />
          <main key={current} className="min-w-0 flex-1 pb-20 md:pb-0">{workspace}</main>
        </div>
        <MobileNav tabs={tabs} active={current} onSelect={select} clan={clan} />
      </div>
    </TerminalProvider>
  );
}
