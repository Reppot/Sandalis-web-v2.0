"use client";

import * as React from "react";
import { reportApi, type Report, type ReportProgress } from "@/entities/report";
import { Scopes, type Can } from "@/entities/session";
import { stockpileApi, type Stockpile } from "@/entities/stockpile";
import { ItemIcon, Loading, Modal, assetUrl, errorText, formatDateTime, useConfirm, useI18n, useNotify, type Translate } from "@/shared";

const unitLabel = (unit: string, t: Translate) => t(unit === "crate" ? "unit.crate" : "unit.unit");
const pct = (part: number, whole: number) => (whole ? Math.min(100, Math.round((part / whole) * 100)) : 0);

/**
 * Выполнение заказа: общий прогресс, что уже привезено (иконки, количество, кто привёз)
 * и журнал вкладов. Кнопка «Сообщить о выполнении» — состав заказа с количествами и склад.
 */
export const ReportProgressPanel: React.FC<{ report: Report; can: Can; userId: string; onStatusMaybeChanged: () => void }> = ({ report, can, userId, onStatusMaybeChanged }) => {
  const { t } = useI18n();
  const notify = useNotify();
  const [progress, setProgress] = React.useState<ReportProgress | null>(null);
  const [open, setOpen] = React.useState(false);
  const [armed, confirm] = useConfirm();

  const load = React.useCallback(() => {
    reportApi.progress(report.id).then(setProgress).catch(() => setProgress(null));
  }, [report.id]);
  React.useEffect(load, [load, report.updated_at]);

  if (!progress) return <div className="report-progress"><Loading /></div>;

  const total = pct(progress.delivered_total, progress.ordered_total);
  // кто что привёз: строка -> {имя: количество}
  const byLine = new Map<string, Map<string, number>>();
  for (const c of progress.contributions) {
    for (const l of c.lines) {
      const who = byLine.get(l.line_id) ?? new Map<string, number>();
      const name = c.user_name ?? c.user_id;
      who.set(name, (who.get(name) ?? 0) + l.quantity);
      byLine.set(l.line_id, who);
    }
  }
  const started = progress.lines.filter((l) => l.delivered > 0);
  const canReport = can(Scopes.REPORTS_PROGRESS) && report.status !== "cancelled" && report.status !== "done";

  const remove = async (id: string) => {
    try {
      setProgress(await reportApi.removeContribution(report.id, id));
    } catch (err) {
      notify({ title: t("progress.title"), message: errorText(err, t("progress.failed")), tone: "danger" });
    }
  };

  return (
    <div data-guide="report-progress" className="report-progress">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="hud-label text-accent">{t("progress.title")}</div>
          <div className="report-progress-total">
            <span className="report-progress-track"><span style={{ width: `${total}%` }} /></span>
            <b>{total}%</b>
            <span className="hud-label text-muted">{t("progress.totals", { done: progress.delivered_total, total: progress.ordered_total })}</span>
          </div>
        </div>
        {canReport ? (
          <button type="button" className="btn btn-primary" data-guide="report-contribute" onClick={() => setOpen(true)}>📦 {t("progress.report")}</button>
        ) : null}
      </div>

      {started.length ? (
        <div className="report-progress-lines">
          {started.map((l) => (
            <div key={l.line_id} className={`report-progress-line ${l.delivered >= l.ordered ? "is-done" : ""}`}>
              <ItemIcon sources={[assetUrl(l.icon_url)]} size={34} label={l.name} />
              <span className="min-w-0 flex-1">
                <span className="report-progress-name">{l.name}</span>
                <span className="report-progress-bar"><span style={{ width: `${pct(l.delivered, l.ordered)}%` }} /></span>
                <span className="report-progress-who">
                  {[...(byLine.get(l.line_id) ?? new Map<string, number>())].map(([who, n]) => `${who} ×${n}`).join(" • ")}
                </span>
              </span>
              <b className="report-progress-qty">{l.delivered}/{l.ordered} {unitLabel(l.unit, t)}</b>
            </div>
          ))}
        </div>
      ) : (
        <p className="hud-label mt-3 text-muted">{t("progress.empty")}</p>
      )}

      {progress.contributions.length ? (
        <div className="report-log">
          <div className="hud-label mb-1.5 text-muted">📜 {t("progress.log", { n: progress.contributions.length })}</div>
          <ul className="flex flex-col gap-1.5">
            {progress.contributions.map((c) => (
              <li key={c.id} className="report-log-entry">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <b className="text-white">{c.user_name ?? c.user_id}</b>
                  <span className="hud-label text-muted">{formatDateTime(c.created_at)}</span>
                  {c.stockpile_label ? <span className="hud-label text-accent">→ 🏬 {c.stockpile_label}</span> : null}
                  {c.user_id === userId || can(Scopes.REPORTS_DELETE) ? (
                    <button type="button" className={`btn btn-danger ml-auto px-1.5 py-0 text-[0.6rem] ${armed === c.id ? "btn-active" : ""}`} onClick={() => confirm(c.id, () => void remove(c.id))}>
                      {armed === c.id ? t("common.confirmQ") : "✕"}
                    </button>
                  ) : null}
                </div>
                <div className="report-log-items">
                  {c.lines.map((l) => (
                    <span key={l.line_id} className="report-log-item" title={l.name}>
                      <ItemIcon sources={[assetUrl(l.icon_url)]} size={22} label={l.name} />
                      <span className="truncate">{l.name}</span>
                      <b>×{l.quantity}</b>
                    </span>
                  ))}
                </div>
                {c.note ? <div className="mt-1 text-[0.75rem] text-white/70">📝 {c.note}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ContributeModal
        open={open}
        report={report}
        progress={progress}
        onClose={() => setOpen(false)}
        onSaved={(next) => {
          setProgress(next);
          setOpen(false);
          if (next.message) notify({ title: t("progress.title"), message: next.message, tone: "success" });
          onStatusMaybeChanged();
        }}
      />
    </div>
  );
};

/** «Сообщить о выполнении»: весь состав заказа — сколько привезено и на какой склад. */
const ContributeModal: React.FC<{ open: boolean; report: Report; progress: ReportProgress; onClose: () => void; onSaved: (p: ReportProgress) => void }> = ({ open, report, progress, onClose, onSaved }) => {
  const { t } = useI18n();
  const notify = useNotify();
  const [qty, setQty] = React.useState<Record<string, string>>({});
  const [stockpiles, setStockpiles] = React.useState<Stockpile[] | null>(null);
  const [stockpileId, setStockpileId] = React.useState("");
  const [otherLabel, setOtherLabel] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setQty({});
    setNote("");
    setOtherLabel("");
    stockpileApi
      .list()
      .then((list) => {
        setStockpiles(list);
        // склад из шапки заказа — по умолчанию
        const fromMeta = list.find((s) => s.name === report.meta.stockpile);
        setStockpileId(fromMeta?.id ?? list[0]?.id ?? "other");
      })
      .catch(() => setStockpiles([]));
  }, [open, report.meta.stockpile]);

  const lines = progress.lines.map((l) => ({ ...l, left: Math.max(0, l.ordered - l.delivered) }));
  const chosen = lines.map((l) => ({ line_id: l.line_id, quantity: parseInt(qty[l.line_id] ?? "", 10) || 0 })).filter((l) => l.quantity > 0);
  const set = (id: string, value: string) => setQty((q) => ({ ...q, [id]: value.replace(/[^\d]/g, "").slice(0, 6) }));

  const submit = async () => {
    if (!chosen.length) return notify({ title: t("progress.title"), message: t("progress.nothing"), tone: "warning" });
    setBusy(true);
    try {
      onSaved(await reportApi.contribute(report.id, {
        lines: chosen,
        stockpile_id: stockpileId && stockpileId !== "other" ? stockpileId : null,
        stockpile_label: stockpileId === "other" ? otherLabel.trim() || null : null,
        note: note.trim() || null,
      }));
    } catch (err) {
      notify({ title: t("progress.title"), message: errorText(err, t("progress.failed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`${t("progress.report")} • ${report.title}`} icon="orders" widthClass="max-w-3xl">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="hud-label text-muted">{t("progress.formHint")}</span>
          <button type="button" className="btn px-2 py-1 text-[0.7rem]" onClick={() => setQty(Object.fromEntries(lines.filter((l) => l.left > 0).map((l) => [l.line_id, String(l.left)])))}>
            ⇣ {t("progress.allLeft")}
          </button>
        </div>
        <div className="contribute-list scroll-area">
          {lines.map((l) => (
            <div key={l.line_id} className={`contribute-row ${l.left === 0 ? "is-done" : ""}`}>
              <ItemIcon sources={[assetUrl(l.icon_url)]} size={36} label={l.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.85rem] text-white">{l.name}</span>
                <span className="hud-label text-muted">{t("progress.rowState", { done: l.delivered, total: l.ordered, left: l.left })} {unitLabel(l.unit, t)}</span>
              </span>
              <button type="button" className="btn px-2 py-1" onClick={() => set(l.line_id, String(Math.max(0, (parseInt(qty[l.line_id] ?? "0", 10) || 0) - 1)))}>−</button>
              <input className="field field-mono w-20 py-1 text-center" inputMode="numeric" placeholder="0" value={qty[l.line_id] ?? ""} onChange={(e) => set(l.line_id, e.target.value)} />
              <button type="button" className="btn px-2 py-1" onClick={() => set(l.line_id, String((parseInt(qty[l.line_id] ?? "0", 10) || 0) + 1))}>＋</button>
              <button type="button" className="btn px-2 py-1 text-[0.65rem]" disabled={l.left === 0} title={t("progress.allLeft")} onClick={() => set(l.line_id, String(l.left))}>{t("progress.max")}</button>
            </div>
          ))}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="hud-label text-muted">🏬 {t("progress.stockpile")}</span>
            <select className="field h-10" value={stockpileId} onChange={(e) => setStockpileId(e.target.value)}>
              {!stockpiles ? <option value="">{t("common.loading")}</option> : null}
              {(stockpiles ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.region} ▶ {s.name}</option>
              ))}
              <option value="other">{t("progress.otherStockpile")}</option>
            </select>
          </label>
          {stockpileId === "other" ? (
            <label className="flex flex-col gap-1">
              <span className="hud-label text-muted">{t("progress.otherLabel")}</span>
              <input className="field h-10" maxLength={160} value={otherLabel} placeholder="BB Callahan's Gate" onChange={(e) => setOtherLabel(e.target.value)} />
            </label>
          ) : null}
        </div>
        <label className="flex flex-col gap-1">
          <span className="hud-label text-muted">📝 {t("progress.note")}</span>
          <input className="field h-10" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="flex items-center justify-end gap-2">
          <span className="hud-label mr-auto text-muted">{t("progress.selected", { n: chosen.length, q: chosen.reduce((n, l) => n + l.quantity, 0) })}</span>
          <button type="button" className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-primary" disabled={busy || !chosen.length} onClick={() => void submit()}>{busy ? t("common.sending") : `✔ ${t("progress.submit")}`}</button>
        </div>
      </div>
    </Modal>
  );
};
