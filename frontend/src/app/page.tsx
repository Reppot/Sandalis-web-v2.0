"use client";

import * as React from "react";
import { OrdersWorkspace } from "@/features/orders";
import { StockpilesWorkspace } from "@/features/stockpiles";
import { TimersWorkspace } from "@/features/timers";
import { CodesWorkspace } from "@/features/codes";
import { ProductionWorkspace } from "@/features/production";
import { AuthRequired, CabinetWorkspace, useSession } from "@/features/cabinet";
import { Scopes } from "@/entities/session";
import { Spinner, cn } from "@/shared";
import { ClipboardList, Archive, Clock, Hash, Cpu, User } from "lucide-react";

type TabKey = "orders" | "stockpiles" | "timers" | "codes" | "production" | "cabinet";

interface NavigationTab {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Вкладка ходит в API — без сессии показываем экран входа. */
  requiresSession: boolean;
}

const tabs: NavigationTab[] = [
  { key: "orders", label: "Заказы", icon: ClipboardList, requiresSession: true },
  { key: "stockpiles", label: "Склады", icon: Archive, requiresSession: true },
  { key: "timers", label: "Таймеры", icon: Clock, requiresSession: true },
  { key: "codes", label: "База кодов", icon: Hash, requiresSession: true },
  { key: "production", label: "Производство", icon: Cpu, requiresSession: false },
  { key: "cabinet", label: "Кабинет", icon: User, requiresSession: false },
];

function isTabKey(value: string | null): value is TabKey {
  return tabs.some((t) => t.key === value);
}

export default function TerminalPage() {
  const { session, loading, can } = useSession();
  const [activeTab, setActiveTab] = React.useState<TabKey>("orders");

  // ?tab=… — прямые ссылки; ?error=… — возврат из Discord OAuth с ошибкой,
  // её показывает форма входа в кабинете.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (params.has("error")) {
      setActiveTab("cabinet");
    } else if (isTabKey(tab)) {
      setActiveTab(tab);
    }
  }, []);

  const selectTab = (key: TabKey) => {
    setActiveTab(key);
    const url = new URL(window.location.href);
    url.search = key === "orders" ? "" : `?tab=${key}`;
    window.history.replaceState(null, "", url);
  };

  const current = tabs.find((t) => t.key === activeTab) ?? tabs[0];

  const renderWorkspace = () => {
    if (current.requiresSession) {
      if (loading) {
        return (
          <div className="py-20 flex justify-center">
            <Spinner size="lg" />
          </div>
        );
      }
      if (!session) {
        return <AuthRequired onOpenCabinet={() => selectTab("cabinet")} />;
      }
    }

    switch (activeTab) {
      case "orders":
        return (
          <OrdersWorkspace
            canWrite={can(Scopes.ORDERS_WRITE, Scopes.STOCKPILES_READ)}
            canDelete={can(Scopes.ORDERS_DELETE)}
            currentUserId={session?.userId ?? null}
          />
        );
      case "stockpiles":
        return <StockpilesWorkspace canWrite={can(Scopes.STOCKPILES_WRITE)} />;
      case "timers":
        return <TimersWorkspace canWrite={can(Scopes.TIMERS_WRITE)} />;
      case "codes":
        return <CodesWorkspace />;
      case "production":
        return <ProductionWorkspace />;
      case "cabinet":
        return <CabinetWorkspace />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-sindaris-bg text-sindaris-text font-mono selection:bg-sindaris-accent selection:text-white">
      {/* Верхняя панель (Header) */}
      <header className="border-b border-sindaris-border bg-sindaris-panel/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 bg-sindaris-accent rounded-full animate-pulse shadow-sm shadow-blue-500" />
            <h1 className="text-base font-bold tracking-wider text-sindaris-accent">
              SINDARIS <span className="text-sindaris-muted font-normal text-xs">// TERMINAL v2.0</span>
            </h1>
          </div>

          <nav className="flex items-center gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => selectTab(tab.key)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-sindaris-accent text-white shadow-xs"
                      : "text-sindaris-muted hover:text-sindaris-text hover:bg-sindaris-border/50"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Основной контейнер рабочей области */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">{renderWorkspace()}</main>
    </div>
  );
}
