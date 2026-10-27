"use client";

import * as React from "react";
import { byDate, operationsApi, parseDate, today, type Operation, type OperationSnapshot } from "@/features/operations/model/operations";
import { OperationsCalendar } from "@/features/operations/ui/OperationsCalendar";
import { MentionTextarea } from "@/features/mail/ui/Mentions";
import { Icon, Modal, errorText, useI18n, useNotify } from "@/shared";

/**
 * «Перенести в операции» / «Новая операция»: календарь с занятыми днями, выбор даты,
 * название и заметка. Снимок карты из «Планирования» прикладывается, если он есть.
 */
export const OperationDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  /** Снимки «Планирования», которые переносятся (все снимки сессии). */
  snapshots?: OperationSnapshot[];
  initialTitle?: string;
  initialDate?: string | null;
  onCreated?: (op: Operation) => void;
}> = ({ open, onClose, snapshots = [], initialTitle = "", initialDate, onCreated }) => {
  const { t, locale } = useI18n();
  const notify = useNotify();
  const [ops, setOps] = React.useState<Operation[]>([]);
  const [date, setDate] = React.useState<string>(today());
  const [title, setTitle] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // куда переносим: новая операция или уже созданная в этот день (свою можно дополнить)
  const [target, setTarget] = React.useState<string>("new");
  const moving = snapshots.length > 0;

  React.useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setNote("");
    setDate(initialDate && initialDate >= today() ? initialDate : today());
    setTarget("new");
    operationsApi.list().then((r) => setOps(r.operations)).catch(() => setOps([]));
  }, [open, initialTitle, initialDate]);

  const sameDay = byDate(ops).get(date) ?? [];
  const mine = moving ? sameDay.filter((o) => o.can_edit) : [];
  React.useEffect(() => setTarget("new"), [date]);
  const pretty = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(parseDate(date));

  const submit = async () => {
    if (target === "new" && !title.trim()) return;
    setBusy(true);
    try {
      const op = target === "new"
        ? await operationsApi.create({ title: title.trim(), date, note, snapshots })
        : await operationsApi.addSnapshots(target, snapshots);
      notify({ title: t("operations.created"), message: `${op.title} · ${pretty}`, tone: "success" });
      onCreated?.(op);
      onClose();
    } catch (err) {
      notify({ title: t("operations.saveFailed"), message: errorText(err, t("operations.saveFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={moving ? t("operations.moveTitle") : t("operations.newTitle")}
      icon="alarm"
      widthClass="max-w-3xl"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-primary" disabled={busy || (target === "new" && !title.trim())} onClick={() => void submit()}>
            <Icon name="check" size={16} />
            {moving ? t("operations.moveSubmit") : t("operations.create")}
          </button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[1.25fr_1fr]">
        <OperationsCalendar operations={ops} selected={date} onSelect={setDate} compact />
        <div className="flex flex-col gap-3">
          <div>
            <div className="field-label">{t("operations.date")}</div>
            <div className="first-cap mt-1 font-semibold text-fg">{pretty}</div>
            {sameDay.length ? (
              <div className="mt-2 text-xs text-warn">
                {t("operations.busyDay", { n: sameDay.length })}
                <ul className="mt-1 list-disc pl-4 text-fg-2">{sameDay.map((o) => <li key={o.id}>{o.title}</li>)}</ul>
              </div>
            ) : (
              <div className="mt-1 text-xs text-fg-3">{t("operations.freeDay")}</div>
            )}
          </div>
          {mine.length ? (
            <div className="flex flex-col gap-1">
              <span className="field-label">{t("operations.target")}</span>
              <div className="segmented flex-wrap">
                <button type="button" className={`segmented-item ${target === "new" ? "is-active" : ""}`} onClick={() => setTarget("new")}>{t("operations.targetNew")}</button>
                {mine.map((o) => (
                  <button key={o.id} type="button" className={`segmented-item ${target === o.id ? "is-active" : ""}`} onClick={() => setTarget(o.id)}>+ {o.title}</button>
                ))}
              </div>
            </div>
          ) : null}
          {target === "new" ? (
          <>
          <label className="flex flex-col gap-1">
            <span className="field-label">{t("operations.title")}</span>
            <input className="field" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={t("operations.titlePlaceholder")} />
          </label>
          <div className="flex flex-col gap-1">
            <span className="field-label">{t("operations.note")}</span>
            <MentionTextarea className="min-h-[5rem] w-full" value={note} maxLength={1000} onChange={setNote} placeholder={t("operations.notePlaceholder")} />
          </div>
          </>
          ) : null}
          {moving ? (
            <div className="text-xs text-fg-3">
              {t("operations.withSnapshots", { n: snapshots.length })}
              <ul className="mt-1 flex flex-wrap gap-1.5">{snapshots.map((s, i) => <li key={i} className="ops-chip">{s.name || `#${i + 1}`}</li>)}</ul>
            </div>
          ) : (
            <p className="text-xs text-fg-3">{t("operations.withoutSnapshot")}</p>
          )}
        </div>
      </div>
    </Modal>
  );
};
