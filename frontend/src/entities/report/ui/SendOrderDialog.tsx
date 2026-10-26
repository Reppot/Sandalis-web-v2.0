"use client";

import * as React from "react";
import { ItemIcon, Modal, assetUrl, errorText, useT, useNotify, Icon } from "@/shared";
import { ORDER_KINDS, reportApi, type OrderKind, type Report, type ReportLineInput, type ReportMeta } from "@/entities/report";
import { useContent } from "@/entities/content";
import { HexTownSelect } from "@/entities/world";

export interface SendOrderLine extends ReportLineInput {
  icon_url?: string | null;
}

/**
 * «Отправить в текущие заказы клана»: название заказа, вид (на склад / бункерную базу /
 * завод) и куда везти. Общий для конструктора заказа и калькулятора завода.
 */
export const SendOrderDialog: React.FC<{
  open: boolean;
  lines: SendOrderLine[];
  defaultKind: OrderKind;
  meta?: ReportMeta;
  onClose: () => void;
  onSent: (report: Report) => void;
}> = ({ open, lines, defaultKind, meta, onClose, onSent }) => {
  const t = useT();
  const notify = useNotify();
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<OrderKind>(defaultKind);
  const [destination, setDestination] = React.useState("");
  // бункерная база и завод: гекс и город из списков текущей войны + уточнение текстом
  const [region, setRegion] = React.useState("");
  const [town, setTown] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const { list } = useContent();
  const fallbackRegions = React.useMemo(() => list<{ name: string }>("region").map((r) => r.payload.name), [list]);
  const needsPlace = kind === "bunker" || kind === "factory";
  // склад назначения и «уточнение» бункера/завода — разные поля: при смене вида не переносим текст
  const pickKind = (next: OrderKind) => {
    if (next === kind) return;
    setKind(next);
    setDestination(next === "stockpile" ? meta?.stockpile ?? "" : "");
    if (next !== "stockpile" && !region) setRegion(meta?.region ?? "");
  };

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setKind(defaultKind);
    setDestination(defaultKind === "stockpile" ? meta?.stockpile ?? "" : "");
    setRegion(defaultKind === "stockpile" ? "" : meta?.region ?? "");
    setTown("");
  }, [open, defaultKind, meta?.stockpile, meta?.region]);

  const total = lines.reduce((n, l) => n + l.quantity, 0);

  const submit = async () => {
    if (!title.trim() || !lines.length || (needsPlace && (!region || !town.trim()))) return;
    setBusy(true);
    // для бункера и завода в шапку заказа идут выбранные гекс и город (+ уточнение)
    const where = needsPlace ? [town.trim(), destination.trim()].filter(Boolean).join(" — ").slice(0, 80) : destination.trim();
    try {
      const r = await reportApi.create({
        title: title.trim(),
        meta: { region: (needsPlace ? region : meta?.region) || null, type: kind, stockpile: where || null },
        lines: lines.map(({ name, item_code, quantity, unit }) => ({ name, item_code, quantity, unit })),
      });
      notify({ title: t("builder.accepted"), message: r.message, tone: "success" });
      onSent(r.report);
    } catch (err) {
      notify({ title: t("reports.report"), message: errorText(err, t("builder.rejected")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("orderSend.title")} icon="orders" widthClass="max-w-xl">
      <div className="grid gap-3">
        <label className="flex flex-col gap-1">
          <span className="field-label">{t("orderSend.name")}</span>
          <input className="field h-11" maxLength={160} autoFocus value={title} placeholder={t("orderSend.namePlaceholder")} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} />
        </label>

        <div>
          <div className="field-label mb-1.5">{t("orderSend.kind")}</div>
          <div data-guide="order-kind" className="order-kinds">
            {ORDER_KINDS.map((k) => (
              <button key={k.key} type="button" className={`order-kind ${kind === k.key ? "is-active" : ""}`} aria-pressed={kind === k.key} onClick={() => pickKind(k.key)}>
                <span className="order-kind-icon" aria-hidden><Icon name={k.icon} size={18} /></span>
                <span className="order-kind-label">{t(k.label)}</span>
                <span className="order-kind-hint">{t(k.hint)}</span>
              </button>
            ))}
          </div>
        </div>

        {needsPlace ? (
          <div data-guide="order-place" className="grid gap-3">
            <HexTownSelect region={region} town={town} onRegion={setRegion} onTown={setTown} purpose={kind === "factory" ? "factory" : "bunker"} fallbackRegions={fallbackRegions} />
            <label className="flex flex-col gap-1.5">
              <span className="field-label">{t(kind === "factory" ? "orderSend.detailFactory" : "orderSend.detailBunker")}</span>
              <input className="field h-10" maxLength={60} value={destination} placeholder={t(kind === "factory" ? "orderSend.detailFactoryPlaceholder" : "orderSend.detailBunkerPlaceholder")} onChange={(e) => setDestination(e.target.value)} />
            </label>
          </div>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="field-label">{t("orderSend.whereStockpile")}</span>
            <input className="field h-10" maxLength={80} value={destination} placeholder={t("orderSend.wherePlaceholder")} onChange={(e) => setDestination(e.target.value)} />
          </label>
        )}

        <div className="order-send-summary">
          <span className="text-xs font-medium text-fg-3">{t("orderSend.summary", { n: lines.length, q: total })}</span>
          <span className="order-send-items">
            {lines.slice(0, 12).map((l) => (
              <span key={`${l.name}-${l.item_code ?? ""}`} className="report-log-item" title={l.name}>
                <ItemIcon sources={[assetUrl(l.icon_url ?? null)]} size={22} label={l.name} />
                <span className="truncate">{l.name}</span>
                <b>×{l.quantity}</b>
              </span>
            ))}
            {lines.length > 12 ? <span className="text-xs text-fg-3">{t("common.more", { n: lines.length - 12 })}</span> : null}
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-primary" data-guide="order-send" disabled={busy || !title.trim() || !lines.length || (needsPlace && (!region || !town.trim()))} onClick={() => void submit()}>
            {busy ? t("common.sending") : t("orderSend.submit")}
          </button>
        </div>
      </div>
    </Modal>
  );
};
