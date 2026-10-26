"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { RegionTownFields } from "@/entities/world";
import { Scopes, type Can } from "@/entities/session";
import { stockpileApi } from "@/entities/stockpile";
import { Button, Field, Modal, errorText, formatCountdown, formatDateTime, secondsLeft, severityOf, timeUnits, useConfirm, useNotify, useT, type MessageKey, Icon } from "@/shared";
import { timersApi, type TimerEvent } from "@/features/timers/api";
import { timerPlace, useClock, useTerminal, type MonitoredTimer } from "@/features/timers/model";

const SEV_COLOR = { critical: "var(--danger)", warning: "var(--warning)", safe: "var(--fg)" } as const;
const RESET_SECONDS = 48 * 3600;

interface TimeValue {
  days: string;
  hours: string;
  minutes: string;
}

function toSeconds(v: TimeValue): number {
  return Number(v.days || 0) * 86400 + Number(v.hours || 0) * 3600 + Number(v.minutes || 0) * 60;
}

const TimeInputs: React.FC<{ value: TimeValue; onChange: (v: TimeValue) => void }> = ({ value, onChange }) => {
  const t = useT();
  const clean = (v: string) => v.replace(/[^\d]/g, "").slice(0, 4);
  const fields: [MessageKey, keyof TimeValue][] = [["timers.days", "days"], ["timers.hours", "hours"], ["timers.minutes", "minutes"]];
  return (
    <div className="panel-inner flex flex-wrap items-center justify-center gap-4 px-3 py-3">
      {fields.map(([label, key]) => (
        <label key={key} className="flex items-center gap-2">
          <span className="text-sm text-fg-2">{t(label)}</span>
          <input className="field field-mono w-[62px] text-center" placeholder="0" inputMode="numeric" value={value[key]} onChange={(e) => onChange({ ...value, [key]: clean(e.target.value) })} />
        </label>
      ))}
    </div>
  );
};

/** «Канал связи» склада: остаток, журнал, заметки, сброс/установка времени, снятие с мониторинга. */
export const TimerManagerModal: React.FC<{ timer: MonitoredTimer | null; can: Can; onClose: () => void }> = ({ timer, can, onClose }) => {
  const t = useT();
  const { upsertTimer, removeTimer } = useTerminal();
  const { media } = useContent();
  const notify = useNotify();
  const now = useClock();
  const [events, setEvents] = React.useState<TimerEvent[]>([]);
  const [time, setTime] = React.useState<TimeValue>({ days: "", hours: "", minutes: "" });
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [armed, confirm] = useConfirm(3500);
  const logRef = React.useRef<HTMLDivElement>(null);
  const timerId = timer?.id;

  const loadEvents = React.useCallback(async (id: string) => {
    try {
      setEvents(await timersApi.events(id));
    } catch {
      setEvents([]);
    }
  }, []);

  React.useEffect(() => {
    if (!timerId) return;
    setTime({ days: "", hours: "", minutes: "" });
    setNote("");
    void loadEvents(timerId);
  }, [timerId, loadEvents]);

  React.useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events.length]);

  if (!timer) return null;
  const ts = secondsLeft(timer.ends_at, now || Date.now());
  const sev = severityOf(ts);
  const { region, location } = timerPlace(timer);

  const run = async (action: () => Promise<string | void>) => {
    setBusy(true);
    try {
      const message = await action();
      if (message) notify({ title: t("timers.channel"), message, tone: "success" });
      if (timer) await loadEvents(timer.id);
    } catch (err) {
      notify({ title: t("common.failure"), message: errorText(err, t("timers.commandFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const restart = (seconds: number) =>
    run(async () => {
      const r = await timersApi.restart(timer.id, seconds);
      upsertTimer(r.timer);
      setTime({ days: "", hours: "", minutes: "" });
      return r.message;
    });

  const addNote = () =>
    note.trim() &&
    run(async () => {
      const r = await timersApi.addEvent(timer.id, note.trim());
      setNote("");
      return r.message;
    });

  return (
    <Modal open onClose={onClose} title={t("timers.channelTitle", { location })} icon="timers" widthClass="max-w-2xl" backdropImage={media("bg_timers")}>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <dl className="kv-list">
          <div><dt>{t("timers.region")}</dt><dd>{region ?? "—"}</dd></div>
          <div><dt>{t("timers.location")}</dt><dd>{location}</dd></div>
          {timer.note && <div><dt>{t("timers.note")}</dt><dd className="text-fg-2">{timer.note}</dd></div>}
        </dl>
        <div data-guide="tmodal-left" className="panel-inner px-5 py-3 text-center">
          <div className="text-xs text-fg-3">{t("timers.left")}</div>
          <div className="timer-value" style={{ color: SEV_COLOR[sev] }}>
            {timer.completed_at ? t("timers.completed") : ts > 0 ? formatCountdown(ts, timeUnits(t)) : t("timers.expired")}
          </div>
        </div>
      </div>

      <div className="mt-5 text-sm font-semibold">{t("timers.log")}</div>
      <div data-guide="tmodal-log" ref={logRef} className="console-log scroll-area mt-2 h-44 px-3 py-2 leading-relaxed">
        {events.length === 0 ? (
          <div className="opacity-60">{t("timers.logEmpty")}</div>
        ) : (
          events.map((e) => (
            <div key={e.id}>
              <span className="text-fg-3">{formatDateTime(e.created_at)} · {e.created_by}:</span> <span className="text-fg">{e.message}</span>
            </div>
          ))
        )}
      </div>

      {(
        <>
          {can(Scopes.TIMERS_LOG) && <div className="mt-3 flex gap-2">
            <input className="field flex-1" data-guide="tmodal-note" placeholder={t("timers.notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addNote()} />
            <button className="btn" disabled={busy || !note.trim()} onClick={() => void addNote()}><Icon name="note" size={15} />{t("timers.toLog")}</button>
          </div>}

          {can(Scopes.TIMERS_UPDATE) && <>
          <div className="mt-4" data-guide="tmodal-time">
            <TimeInputs value={time} onChange={setTime} />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button className="btn btn-active btn-lg" data-guide="tmodal-reset" disabled={busy} onClick={() => void restart(RESET_SECONDS)}>
              <Icon name="refresh" size={16} />
              {t("timers.reset48")}
            </button>
            <button
              className="btn btn-primary btn-lg"
              data-guide="tmodal-set"
              disabled={busy}
              onClick={() => {
                const seconds = toSeconds(time);
                if (seconds <= 0) return notify({ title: t("common.failure"), message: t("timers.timePositive"), tone: "danger" });
                void restart(seconds);
              }}
            >
              <Icon name="check" size={16} />
              {t("timers.setTimer")}
            </button>
          </div>
          </>}

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
            <span className="text-xs text-fg-3">{t("timers.createdBy", { name: timer.created_by })}</span>
            {can(Scopes.TIMERS_DELETE) && <button
              data-guide="tmodal-remove"
              className={`btn ${armed === "delete" ? "btn-danger" : "btn-ghost text-danger"}`}
              disabled={busy}
              onClick={() =>
                confirm("delete", () =>
                  void run(async () => {
                    await timersApi.delete(timer.id);
                    removeTimer(timer.id);
                    onClose();
                    return t("timers.removed", { location });
                  }),
                )
              }
            >
              <Icon name="trash" size={15} />
              {armed === "delete" ? t("timers.confirmRemove") : t("timers.remove")}
            </button>}
          </div>
        </>
      )}
    </Modal>
  );
};

/**
 * Регистрация склада в матрице: создаёт склад клана (регион + локация) и таймер,
 * привязанный к нему. Если склад с таким именем уже есть — используется он.
 */
export const RegisterTimerModal: React.FC<{ open: boolean; onClose: () => void; preset?: { region: string; location: string } | null }> = ({ open, onClose, preset }) => {
  const t = useT();
  const { stockpiles, upsertTimer, refresh } = useTerminal();
  const { list, media } = useContent();
  const notify = useNotify();
  const [region, setRegion] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [time, setTime] = React.useState<TimeValue>({ days: "2", hours: "0", minutes: "0" });
  const [busy, setBusy] = React.useState(false);
  const regions = list<{ name: string }>("region");

  React.useEffect(() => {
    if (!open) return;
    // «Поставить на мониторинг» из карточки склада — гекс и склад уже известны
    setRegion(preset?.region ?? "");
    setLocation(preset?.location ?? "");
    setTime({ days: "2", hours: "0", minutes: "0" });
  }, [open, preset]);

  const submit = async () => {
    const seconds = toSeconds(time);
    if (!region.trim() || !location.trim()) return notify({ title: t("timers.registerTitleShort"), message: t("timers.needRegion"), tone: "warning" });
    if (seconds <= 0) return notify({ title: t("timers.registerTitleShort"), message: t("timers.timePositive"), tone: "warning" });
    setBusy(true);
    try {
      const existing = stockpiles.find((s) => s.name.toLowerCase() === location.trim().toLowerCase());
      const stockpile = existing ?? (await stockpileApi.create(location.trim(), region.trim())).stockpile;
      const created = await timersApi.create({ title: location.trim(), durationSeconds: seconds, stockpileId: stockpile.id });
      upsertTimer(created.timer);
      void refresh();
      notify({ title: t("timers.registered"), message: t("timers.registeredMsg", { region, location }), tone: "success" });
      onClose();
    } catch (err) {
      notify({ title: t("common.failure"), message: errorText(err, t("timers.registerFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("timers.registerTitle")} icon="stockpile" widthClass="max-w-lg" backdropImage={media("bg_storage")}>
      <div className="grid gap-3">
        <RegionTownFields
          region={region}
          onRegion={setRegion}
          town={location}
          onTown={setLocation}
          regionLabel={t("timers.regionHex")}
          townLabel={t("timers.locationType")}
          townPlaceholder={t("timers.locationPlaceholder")}
          fallbackRegions={regions.map((r) => r.payload.name)}
          onEnter={() => void submit()}
        />
        <div>
          <div className="field-label mb-1.5">{t("timers.startHold")}</div>
          <TimeInputs value={time} onChange={setTime} />
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" isLoading={busy} onClick={() => void submit()}><Icon name="clock" size={15} />{t("timers.monitor")}</Button>
        </div>
      </div>
    </Modal>
  );
};
