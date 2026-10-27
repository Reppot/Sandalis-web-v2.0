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
  snapshot?: OperationSnapshot | null;
  initialTitle?: string;
  initialDate?: string | null;
  onCreated?: (op: Operation) => void;
}> = ({ open, onClose, snapshot, initialTitle = "", initialDate, onCreated }) => {
  const { t, locale } = useI18n();
  const notify = useNotify();
  const [ops, setOps] = React.useState<Operation[]>([]);
  const [date, setDate] = React.useState<string>(today());
  const [title, setTitle] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setNote("");
    setDate(initialDate && initialDate >= today() ? initialDate : today());
    operationsApi.list().then((r) => setOps(r.operations)).catch(() => setOps([]));
  }, [open, initialTitle, initialDate]);

  const sameDay = byDate(ops).get(date) ?? [];
  const pretty = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(parseDate(date));

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const op = await operationsApi.create({ title: title.trim(), date, note, snapshot: snapshot ?? null });
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
      title={snapshot ? t("operations.moveTitle") : t("operations.newTitle")}
      icon="alarm"
      widthClass="max-w-3xl"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-primary" disabled={busy || !title.trim()} onClick={() => void submit()}>
            <Icon name="check" size={16} />
            {snapshot ? t("operations.moveSubmit") : t("operations.create")}
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
          <label className="flex flex-col gap-1">
            <span className="field-label">{t("operations.title")}</span>
            <input className="field" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={t("operations.titlePlaceholder")} />
          </label>
          <div className="flex flex-col gap-1">
            <span className="field-label">{t("operations.note")}</span>
            <MentionTextarea className="min-h-[5rem] w-full" value={note} maxLength={1000} onChange={setNote} placeholder={t("operations.notePlaceholder")} />
          </div>
          <p className="text-xs text-fg-3">{snapshot ? t("operations.withSnapshot", { n: snapshot.shapes.length }) : t("operations.withoutSnapshot")}</p>
        </div>
      </div>
    </Modal>
  );
};
