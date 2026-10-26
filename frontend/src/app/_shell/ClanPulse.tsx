"use client";

import * as React from "react";
import { reportApi } from "@/entities/report";
import { useRiskSummary, useTerminal } from "@/features/timers";
import { Icon, cn, useT, type IconName } from "@/shared";

/**
 * Сводка клана над витриной инструментов: склады под угрозой, активные заказы и
 * склады всего — каждая карточка ведёт в свой раздел.
 */
export const ClanPulse: React.FC<{ canReports: boolean; canStockpiles: boolean; onOpen: (view: "reports" | "stockpiles") => void }> = ({ canReports, canStockpiles, onOpen }) => {
  const t = useT();
  const { stockpiles, loading } = useTerminal();
  const risk = useRiskSummary();
  const [active, setActive] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!canReports) return;
    reportApi
      .list(["open", "in_progress"])
      .then((r) => setActive(r.length))
      .catch(() => setActive(null));
  }, [canReports]);

  if (!canReports && !canStockpiles) return null;
  const danger = risk.critical + risk.warning;

  return (
    <section className="pulse-grid" aria-label={t("pulse.title")}>
      {canStockpiles ? (
        <PulseCard
          icon="clock"
          tone={risk.critical ? "danger" : risk.warning ? "warning" : "success"}
          value={loading ? "—" : danger || <Icon name="check" size={26} strokeWidth={2.5} className="text-safe" />}
          label={danger ? t("pulse.atRisk") : t("pulse.allSafe")}
          hint={danger ? t("pulse.riskHint", { c: risk.critical, w: risk.warning }) : t("pulse.safeHint")}
          onClick={() => onOpen("stockpiles")}
        />
      ) : null}
      {canReports ? (
        <PulseCard icon="note" tone="info" value={active ?? "—"} label={t("pulse.orders")} hint={t("pulse.ordersHint")} onClick={() => onOpen("reports")} />
      ) : null}
      {canStockpiles ? (
        <PulseCard icon="warehouse" tone="neutral" value={loading ? "—" : stockpiles.length} label={t("pulse.stockpiles")} hint={t("pulse.stockpilesHint")} onClick={() => onOpen("stockpiles")} />
      ) : null}
    </section>
  );
};

const PulseCard: React.FC<{ icon: IconName; tone: "danger" | "warning" | "success" | "info" | "neutral"; value: React.ReactNode; label: string; hint: string; onClick: () => void }> = ({ icon, tone, value, label, hint, onClick }) => (
  <button type="button" className={cn("pulse-card", `is-${tone}`)} onClick={onClick}>
    <span className="pulse-card-icon" aria-hidden>
      <Icon name={icon} size={18} />
    </span>
    <span className="min-w-0 flex-1 text-left">
      <span className="pulse-card-value">{value}</span>
      <span className="pulse-card-label">{label}</span>
      <span className="pulse-card-hint">{hint}</span>
    </span>
    <Icon name="chevronRight" size={16} className="pulse-card-arrow" />
  </button>
);
