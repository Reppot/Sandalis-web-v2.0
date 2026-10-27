"use client";

import * as React from "react";
import { clanApi, type ClanProfile } from "@/entities/clan";
import { useContent } from "@/entities/content";
import { Scopes } from "@/entities/session";
import { CabinetWorkspace, LoginScreen, useSession } from "@/features/cabinet";
import { CodeBaseWorkspace } from "@/features/codes";
import { PlanningWorkspace } from "@/features/planning";
import { OperationsWorkspace } from "@/features/operations";
import { MailWorkspace, useUnreadMail } from "@/features/mail";
import { ReportsWorkspace } from "@/features/reports";
import { StatsWorkspace } from "@/features/stats";
import { PyramidWorkspace, SupplyWorkspace } from "@/features/supply";
import { StockpilesWorkspace, TerminalProvider } from "@/features/timers";
import { TOOL_CALCULATORS, ToolsWorkspace, type ToolModule } from "@/features/tools";
import { TrainingWorkspace } from "@/features/training";
import { GuideWorkspace } from "@/features/guide";
import { FeedbackWorkspace, SupportWorkspace } from "@/features/feedback";
import { ManagementWorkspace } from "@/features/management";
import { ClanWorkspace, type ClanSection } from "@/app/_shell/ClanWorkspace";
import { Header } from "@/app/_shell/Header";
import { MobileNav, Sidebar, type NavProps } from "@/app/_shell/Navigation";
import { CommandPalette, usePaletteHotkey } from "@/app/_shell/CommandPalette";
import { ClanPulse } from "@/app/_shell/ClanPulse";
import { Welcome, type WelcomeStep } from "@/app/_shell/Welcome";
import { isClanView, isTabKey, isToolModule, legacyClanView, tabKeys, visibleTabs, type ClanView, type TabKey } from "@/app/_shell/tabs";
import { CopyrightNotice, assetUrl, useT, type MessageKey } from "@/shared";

export default function TerminalPage() {
  const t = useT();
  const { session, loading, setSession, can, logout } = useSession();
  const { media } = useContent();
  const [tab, setTab] = React.useState<TabKey>("tools");
  // открытый модуль «Инструментов» (?tab=tools&tool=...): заказы, пирамида, коды, калькуляторы
  const [tool, setTool] = React.useState<string | null>(null);
  // подраздел «Вашего клана» (?tab=clan&view=...): заказы, склады, обучение, управление
  const [clanView, setClanView] = React.useState<ClanView>("reports");
  const [clan, setClan] = React.useState<ClanProfile | null>(null);
  const [palette, setPalette] = React.useState(false);
  const openPalette = React.useCallback(() => setPalette(true), []);
  const closePalette = React.useCallback(() => setPalette(false), []);
  usePaletteHotkey(openPalette);

  React.useEffect(() => {
    // браузер не должен «восстанавливать» прокрутку старой страницы при перезагрузке
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  }, []);

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
    sub = sub ?? null;
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
  // почта на сайте: счётчик непрочитанного в шапке (гостю почты нет)
  const unreadMail = useUnreadMail(Boolean(session) && !isGuest);
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
      ...(can(Scopes.PYRAMID_READ)
        ? [{ id: "pyramid", icon: "pyramid" as const, label: "nav.pyramid.label" as const, clanData: true, isNew: true, render: () => <PyramidWorkspace can={can} onOpenConstructor={() => openTool("orders")} /> }]
        : []),
      { id: "planning", icon: "map" as const, label: "nav.planning.label" as const, isNew: true, render: () => <PlanningWorkspace /> },
      { id: "codes", icon: "codes" as const, label: "nav.codes.label" as const, render: () => <CodeBaseWorkspace /> },
    ],
    [can, openClan, openTool],
  );

  const clanSections = React.useMemo<ClanSection[]>(
    () => [
      ...(can(Scopes.REPORTS_READ)
        ? [{ view: "reports" as const, icon: "reports" as const, label: "nav.reports.label" as const, hint: "nav.reports.hint" as const, render: () => <ReportsWorkspace can={can} userId={session?.userId ?? ""} onOpenConstructor={() => openTool("orders")} onOpenOperations={() => openClan("operations")} /> }]
        : []),
      ...(can(Scopes.STOCKPILES_READ) || can(Scopes.TIMERS_READ)
        ? [{
            view: "stockpiles" as const, icon: "stockpile" as const, label: "clan.stockpilesTitle" as const, hint: "clan.stockpilesNav" as const,
            render: () => <StockpilesWorkspace can={can} />,
          }]
        : []),
      ...(can(Scopes.CLAN_STATS)
        ? [{ view: "stats" as const, icon: "stats" as const, label: "nav.stats.label" as const, hint: "nav.stats.hint" as const, render: () => <StatsWorkspace /> }]
        : []),
      ...(!isGuest && can(Scopes.OPERATIONS_READ)
        ? [
            { view: "operations" as const, icon: "alarm" as const, label: "nav.operations.label" as const, hint: "nav.operations.hint" as const, render: () => <OperationsWorkspace onOpenPlanning={() => openTool("planning")} /> },
          ]
        : []),
      { view: "training" as const, icon: "training" as const, label: "nav.training.label" as const, hint: "nav.training.hint" as const, render: () => <TrainingWorkspace /> },
      ...(isOwner
        ? [{ view: "management" as const, icon: "map" as const, label: "nav.management.label" as const, hint: "nav.management.hint" as const, render: () => <ManagementWorkspace /> }]
        : []),
    ],
    [can, isOwner, isGuest, openTool, openClan],
  );

  if (loading) {
    return (
      <div className="app-splash">
        <span className="title-brand text-lg">SINDARIS</span>
        <span className="app-splash-bar" aria-hidden />
        <span className="sr-only">{t("app.connecting")}</span>
      </div>
    );
  }

  if (!session) return <LoginScreen onLoggedIn={setSession} />;

  const welcomeSteps: WelcomeStep[] = isGuest
    ? [
        { title: "welcome.guest1", hint: "welcome.guest1Hint", onClick: () => openTool("factory") },
        { title: "welcome.guest2", hint: "welcome.guest2Hint", onClick: () => openTool("codes") },
        { title: "welcome.guest3", hint: "welcome.guest3Hint", onClick: () => void logout() },
      ]
    : [
        ...(clanSections.some((s) => s.view === "stockpiles") ? [{ title: "welcome.step1" as const, hint: "welcome.step1Hint" as const, onClick: () => openClan("stockpiles") }] : []),
        ...(toolModules.some((m) => m.id === "orders") ? [{ title: "welcome.step2" as const, hint: "welcome.step2Hint" as const, onClick: () => openTool("orders") }] : []),
        { title: "welcome.step3", hint: "welcome.step3Hint", onClick: () => openTool("factory") },
      ];

  const workspace = (() => {
    switch (current) {
      case "clan":
        return <ClanWorkspace profile={clan} role={session.role} sections={clanSections} view={clanView} onView={openClan} />;
      case "tools":
        return (
          <ToolsWorkspace
            modules={toolModules}
            active={tool}
            onOpen={openTool}
            canSendOrders={can(Scopes.REPORTS_CREATE)}
            onOrderSent={() => openClan("reports")}
            userName={isGuest ? null : session.displayName}
            welcome={<Welcome steps={welcomeSteps} />}
            summary={isGuest ? null : <ClanPulse canReports={can(Scopes.REPORTS_READ)} canStockpiles={can(Scopes.STOCKPILES_READ) || can(Scopes.TIMERS_READ)} onOpen={openClan} />}
          />
        );
      case "guide":
        return <GuideWorkspace />;
      case "feedback":
        return <FeedbackWorkspace displayName={session.displayName} />;
      case "mail":
        return <MailWorkspace onOpenOperations={() => openClan("operations")} onOpenFeedback={() => select("feedback")} onOpenOrders={() => openClan("reports")} onOpenStockpiles={() => openClan("stockpiles")} />;
      case "support":
        return <SupportWorkspace />;
      case "cabinet":
        return <CabinetWorkspace />;
    }
  })();

  const allTools = [...toolModules, ...TOOL_CALCULATORS];
  const currentTool = current === "tools" ? allTools.find((m) => m.id === tool) ?? null : null;
  const currentClan = current === "clan" ? clanSections.find((s) => s.view === clanView) ?? clanSections[0] : null;
  const nav: NavProps = {
    tabs,
    active: current,
    onSelect: select,
    clan,
    tools: allTools.map((m) => ({ id: m.id, icon: m.icon, label: `toolsnav.${m.id}` as MessageKey, isNew: m.isNew })),
    activeTool: currentTool?.id ?? null,
    clanSections: clanSections.map((s) => ({ id: s.view, icon: s.icon, label: `clannav.${s.view}` as MessageKey })),
    activeClanView: currentClan?.view ?? clanView,
    user: { name: session.displayName ?? t("role.guest"), avatar: assetUrl(session.avatarUrl) },
    logo: media("clan_logo"),
  };
  const section = current === "clan" ? clan?.name ?? t("nav.clan.label") : t(tabKeys(current).label);
  const page = currentTool ? t(currentTool.label) : currentClan ? t(currentClan.label) : null;

  return (
    <TerminalProvider enabled={can(Scopes.TIMERS_READ)}>
      <div className="app">
        <Sidebar {...nav} />
        <div className="app-main">
          <Header section={section} page={page} onHome={() => select("tools")} onSearch={openPalette} onAlerts={clanSections.some((s) => s.view === "stockpiles") ? () => openClan("stockpiles") : undefined} mail={isGuest ? undefined : { unread: unreadMail, onOpen: () => select("mail") }} />
          <main key={`${current}:${currentTool?.id ?? currentClan?.view ?? ""}`} className={currentTool?.id === "planning" ? "app-content is-full" : "app-content"}>
            {workspace}
          </main>
          <CopyrightNotice className="app-footer" />
        </div>
        <MobileNav {...nav} />
        <CommandPalette {...nav} open={palette} onClose={closePalette} />
      </div>
    </TerminalProvider>
  );
}
