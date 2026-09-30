"use client";

import * as React from "react";
import { OrdersWorkspace } from "@/features/orders";
import { StockpilesWorkspace } from "@/features/stockpiles";
import { TimersWorkspace } from "@/features/timers";
import { CodesWorkspace } from "@/features/codes";
import { ProductionWorkspace } from "@/features/production";
import { CabinetWorkspace } from "@/features/cabinet";
import { cn } from "@/shared";
import { ClipboardList, Archive, Clock, Hash, Cpu, User } from "lucide-react";

type TabKey = "orders" | "stockpiles" | "timers" | "codes" | "production" | "cabinet";

interface NavigationTab {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: NavigationTab[] = [
  { key: "orders", label: "Заказы", icon: ClipboardList },
  { key: "stockpiles", label: "Склады", icon: Archive },
  { key: "timers", label: "Таймеры", icon: Clock },
  { key: "codes", label: "База кодов", icon: Hash },
  { key: "production", label: "Производство", icon: Cpu },
  { key: "cabinet", label: "Кабинет", icon: User },
];

export default function TerminalPage() {
  const [activeTab, setActiveTab] = React.useState<TabKey>("orders");

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
                  onClick={() => setActiveTab(tab.key)}
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
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">
        {activeTab === "orders" && <OrdersWorkspace />}
        {activeTab === "stockpiles" && <StockpilesWorkspace />}
        {activeTab === "timers" && <TimersWorkspace />}
        {activeTab === "codes" && <CodesWorkspace />}
        {activeTab === "production" && <ProductionWorkspace />}
        {activeTab === "cabinet" && <CabinetWorkspace />}
      </main>
    </div>
  );
}