"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { stockpileApi } from "@/entities/stockpile";
import { Button, Field, Modal, errorText, formatCountdown, formatDateTime, secondsLeft, severityOf, uiIcon, useConfirm, useNotify } from "@/shared";
import { timersApi, type TimerEvent } from "@/features/timers/api";
import { timerPlace, useClock, useTerminal, type MonitoredTimer } from "@/features/timers/model";

const SEV_COLOR = { critical: "#ff5555", warning: "#ff9900", safe: "#a3e635" } as const;
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
  const clean = (v: string) => v.replace(/[^\d]/g, "").slice(0, 4);
  const fields: [string, keyof TimeValue][] = [["ДНИ", "days"], ["ЧАСЫ", "hours"], ["МИНУТЫ", "minutes"]];
  return (
    <div className="panel-inner flex flex-wrap items-center justify-center gap-3 rounded px-3 py-3">
      {fields.map(([label, key]) => (
        <label key={key} className="flex items-center gap-2">
          <span className="hud-label text-white/80">{label}:</span>
          <input className="field field-mono w-[62px] text-center" placeholder="0" inputMode="numeric" value={value[key]} onChange={(e) => onChange({ ...value, [key]: clean(e.target.value) })} />
        </label>
      ))}
    </div>
  );
};

/** «Канал связи» склада: остаток, журнал, заметки, сброс/установка времени, снятие с мониторинга. */
export const TimerManagerModal: React.FC<{ timer: MonitoredTimer | null; canWrite: boolean; onClose: () => void }> = ({ timer, canWrite, onClose }) => {
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
      if (message) notify({ title: "КАНАЛ СВЯЗИ", message, tone: "success" });
      if (timer) await loadEvents(timer.id);
    } catch (err) {
      notify({ title: "СБОЙ", message: errorText(err, "Сервер не принял команду"), tone: "danger" });
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
    <Modal open onClose={onClose} title={`🛠️ Канал связи: ${location}`} icon={uiIcon("24-hour-clock")} widthClass="max-w-2xl" backdropImage={media("bg_timers")}>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1 text-[0.85rem]">
          <div>🗺️ Регион: <span className="text-accent">{region ?? "—"}</span></div>
          <div>📍 Локация: <span className="text-accent">{location}</span></div>
          {timer.note && <div className="text-white/70">📝 {timer.note}</div>}
        </div>
        <div className="panel-inner rounded px-4 py-2 text-center">
          <div className="hud-label text-muted">Осталось</div>
          <div className="timer-value" style={{ color: SEV_COLOR[sev], textShadow: `0 0 14px ${SEV_COLOR[sev]}66` }}>
            {timer.completed_at ? "ЗАВЕРШЁН" : ts > 0 ? formatCountdown(ts) : "ИСТЁК"}
          </div>
        </div>
      </div>

      <div className="hud-label mt-4 text-white/80">📜 Журнал обновлений склада:</div>
      <div ref={logRef} className="console-log scroll-area mt-1 h-44 rounded px-3 py-2 leading-relaxed">
        {events.length === 0 ? (
          <div className="opacity-60">[СИСТЕМА]: Записей нет.</div>
        ) : (
          events.map((e) => (
            <div key={e.id}>
              <span className="opacity-60">{formatDateTime(e.created_at)} • {e.created_by}:</span> {e.message}
            </div>
          ))
        )}
      </div>

      {canWrite && (
        <>
          <div className="mt-3 flex gap-2">
            <input className="field field-mono flex-1 text-xs" placeholder="Заметка интенданта в журнал..." value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addNote()} />
            <button className="btn" disabled={busy || !note.trim()} onClick={() => void addNote()}>📝 В журнал</button>
          </div>

          <div className="mt-4">
            <TimeInputs value={time} onChange={setTime} />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button className="btn" style={{ background: "#1e291b", color: "#a3e635", borderColor: "#16a34a" }} disabled={busy} onClick={() => void restart(RESET_SECONDS)}>
              ♻️ Сбросить на 48 часов
            </button>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                const seconds = toSeconds(time);
                if (seconds <= 0) return notify({ title: "СБОЙ", message: "Итоговое время должно быть больше 0!", tone: "danger" });
                void restart(seconds);
              }}
            >
              ✅ Задать таймер
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
            <span className="hud-label text-muted">Заведён: {timer.created_by}</span>
            <button
              className={`btn btn-danger ${armed === "delete" ? "btn-active" : ""}`}
              disabled={busy}
              onClick={() =>
                confirm("delete", () =>
                  void run(async () => {
                    await timersApi.delete(timer.id);
                    removeTimer(timer.id);
                    onClose();
                    return `Склад «${location}» снят с мониторинга.`;
                  }),
                )
              }
            >
              {armed === "delete" ? "⚠️ Подтвердить снятие" : "🗑 Снять с мониторинга"}
            </button>
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
export const RegisterTimerModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { stockpiles, upsertTimer, refresh } = useTerminal();
  const { list, media } = useContent();
  const notify = useNotify();
  const [region, setRegion] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [time, setTime] = React.useState<TimeValue>({ days: "2", hours: "0", minutes: "0" });
  const [busy, setBusy] = React.useState(false);
  const listId = React.useId();
  const regions = list<{ name: string }>("region");

  React.useEffect(() => {
    if (!open) return;
    setRegion("");
    setLocation("");
    setTime({ days: "2", hours: "0", minutes: "0" });
  }, [open]);

  const submit = async () => {
    const seconds = toSeconds(time);
    if (!region.trim() || !location.trim()) return notify({ title: "РЕГИСТРАЦИЯ", message: "Укажите регион (гекс) и локацию склада.", tone: "warning" });
    if (seconds <= 0) return notify({ title: "РЕГИСТРАЦИЯ", message: "Время удержания должно быть больше 0.", tone: "warning" });
    setBusy(true);
    try {
      const existing = stockpiles.find((s) => s.name.toLowerCase() === location.trim().toLowerCase());
      const stockpile = existing ?? (await stockpileApi.create(location.trim(), region.trim())).stockpile;
      const created = await timersApi.create({ title: location.trim(), durationSeconds: seconds, stockpileId: stockpile.id });
      upsertTimer(created.timer);
      void refresh();
      notify({ title: "СКЛАД ЗАРЕГИСТРИРОВАН", message: `${region} ▶ ${location} поставлен на мониторинг.`, tone: "success" });
      onClose();
    } catch (err) {
      notify({ title: "СБОЙ", message: errorText(err, "Не удалось зарегистрировать склад"), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Регистрация склада в матрице секторов" icon={uiIcon("barracks")} widthClass="max-w-lg" backdropImage={media("bg_storage")}>
      <div className="grid gap-3">
        <Field label="Регион / гекс" list={listId} placeholder="Clanshead Valley" value={region} onChange={(e) => setRegion(e.target.value)} autoFocus />
        <datalist id={listId}>
          {regions.map((r) => (
            <option key={r.key} value={r.payload.name} />
          ))}
        </datalist>
        <Field label="Локация / тип склада" placeholder="Порт, Склад снабжения, Бункерная база..." value={location} onChange={(e) => setLocation(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} />
        <div>
          <div className="hud-label mb-1 text-muted">Стартовое удержание (по умолчанию 48 ч)</div>
          <TimeInputs value={time} onChange={setTime} />
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" isLoading={busy} onClick={() => void submit()}>🏳️ Поставить на мониторинг</Button>
        </div>
      </div>
    </Modal>
  );
};
