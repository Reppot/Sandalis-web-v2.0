"use client";

import * as React from "react";
import { ItemIcon, Modal, assetUrl, errorText, useT, useNotify } from "@/shared";
import { ORDER_KINDS, reportApi, type OrderKind, type Report, type ReportLineInput, type ReportMeta } from "@/entities/report";

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
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setKind(defaultKind);
    setDestination(meta?.stockpile ?? "");
  }, [open, defaultKind, meta?.stockpile]);

  const total = lines.reduce((n, l) => n + l.quantity, 0);

  const submit = async () => {
    if (!title.trim() || !lines.length) return;
    setBusy(true);
    try {
      const r = await reportApi.create({
        title: title.trim(),
        meta: { region: meta?.region ?? null, type: kind, stockpile: destination.trim() || null },
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
          <span className="hud-label text-muted">{t("orderSend.name")}</span>
          <input className="field h-11" maxLength={160} autoFocus value={title} placeholder={t("orderSend.namePlaceholder")} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} />
        </label>

        <div>
          <div className="hud-label mb-1.5 text-muted">{t("orderSend.kind")}</div>
          <div data-guide="order-kind" className="order-kinds">
            {ORDER_KINDS.map((k) => (
              <button key={k.key} type="button" className={`order-kind ${kind === k.key ? "is-active" : ""}`} aria-pressed={kind === k.key} onClick={() => setKind(k.key)}>
                <span className="order-kind-icon" aria-hidden>{k.icon}</span>
                <span className="order-kind-label">{t(k.label)}</span>
                <span className="order-kind-hint">{t(k.hint)}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="hud-label text-muted">{t(kind === "factory" ? "orderSend.whereFactory" : kind === "bunker" ? "orderSend.whereBunker" : "orderSend.whereStockpile")}</span>
          <input className="field h-10" maxLength={80} value={destination} placeholder={t("orderSend.wherePlaceholder")} onChange={(e) => setDestination(e.target.value)} />
        </label>

        <div className="order-send-summary">
          <span className="hud-label text-muted">{t("orderSend.summary", { n: lines.length, q: total })}</span>
          <span className="order-send-items">
            {lines.slice(0, 12).map((l) => (
              <span key={`${l.name}-${l.item_code ?? ""}`} className="report-log-item" title={l.name}>
                <ItemIcon sources={[assetUrl(l.icon_url ?? null)]} size={22} label={l.name} />
                <span className="truncate">{l.name}</span>
                <b>×{l.quantity}</b>
              </span>
            ))}
            {lines.length > 12 ? <span className="hud-label text-muted">{t("common.more", { n: lines.length - 12 })}</span> : null}
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-primary" data-guide="order-send" disabled={busy || !title.trim() || !lines.length} onClick={() => void submit()}>
            {busy ? t("common.sending") : `📨 ${t("orderSend.submit")}`}
          </button>
        </div>
      </div>
    </Modal>
  );
};
