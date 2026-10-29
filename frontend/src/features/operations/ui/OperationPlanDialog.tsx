"use client";

import * as React from "react";
import {
  BRIEF_SECTIONS,
  POINT_ICON,
  going,
  operationsApi,
  parseDate,
  planId,
  planInput,
  shortages,
  today,
  toViewerSnapshot,
  type AttendStatus,
  type BriefSection,
  type Operation,
  type OperationFull,
  type Outcome,
  type Participant,
  type PlanInput,
  type PlanStage,
} from "@/features/operations/model/operations";
import { useSession } from "@/features/cabinet";
import { Scopes } from "@/entities/session";
import { useStructureCatalog } from "@/features/planning/model/plan";
import { SnapshotImage } from "@/features/planning/ui/SnapshotImage";
import { reportApi, type Report } from "@/entities/report";
import { SendOrderDialog, type SendOrderLine } from "@/entities/report/ui/SendOrderDialog";
import { MentionText } from "@/features/mail/ui/Mentions";
import { REPORT_STATUS_LABEL } from "@/entities/report";
import { Icon, Loading, Modal, cn, errorText, useI18n, useNotify } from "@/shared";

type Tab = "brief" | "people" | "plan" | "supply" | "debrief";
const TABS: Tab[] = ["brief", "people", "plan", "supply", "debrief"];
const STATUSES: AttendStatus[] = ["go", "maybe", "no"];
const OUTCOMES: Outcome[] = ["success", "partial", "fail"];

/** Переключатель «показывать в брифинге» (глаз). */
const BriefToggle: React.FC<{ on: boolean; onChange: (on: boolean) => void; disabled?: boolean }> = ({ on, onChange, disabled }) => {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className={cn("icon-btn ops-eye", !on && "is-off")}
      disabled={disabled}
      onClick={() => onChange(!on)}
      aria-pressed={on}
      title={on ? t("opsPlan.inBrief") : t("opsPlan.notInBrief")}
      aria-label={on ? t("opsPlan.inBrief") : t("opsPlan.notInBrief")}
    >
      <Icon name="eye" size={15} />
    </button>
  );
};

/**
 * Детальный план операции: брифинг (без скрытого), состав с ролями и отрядами, этапы по времени
 * и точки на карте (каждый можно исключить из брифинга), снабжение по заказам и итоги с явкой.
 * Править план может автор операции или офицер с правом на операции; этап отмечает и ответственный.
 */
export const OperationPlanDialog: React.FC<{
  op: Operation | null;
  onClose: () => void;
  onChange: (op: Operation) => void;
  onOpenMap: (op: Operation, i: number) => void;
  /** Заказы клана — для меток заказов на снимках. */
  orders: Report[];
}> = ({ op, onClose, onChange, onOpenMap, orders }) => {
  const { t, locale } = useI18n();
  const notify = useNotify();
  const { session, can } = useSession();
  const canOrder = can(Scopes.REPORTS_CREATE);
  const me = session?.userId;
  const [tab, setTab] = React.useState<Tab>("brief");
  const [full, setFull] = React.useState<OperationFull | null>(null);
  const [draft, setDraft] = React.useState<PlanInput | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [debriefText, setDebriefText] = React.useState("");
  // «Заказ на нехватку»: выбранные предметы → окно отправки заказа
  const [picked, setPicked] = React.useState<Set<string> | null>(null);
  const [orderLines, setOrderLines] = React.useState<SendOrderLine[] | null>(null);
  const briefRef = React.useRef<HTMLDivElement>(null);
  const { structures } = useStructureCatalog();
  // PNG снимков карты (для отправки брифинга в Discord): номер снимка → картинка
  const shots = React.useRef(new Map<number, Blob>());
  const opId = op?.id;

  React.useEffect(() => {
    if (!opId) return;
    setTab("brief");
    setFull(null);
    setDirty(false);
    setPicked(null);
    setOrderLines(null);
    shots.current.clear();
    operationsApi.get(opId).then(setFull).catch(() => setFull(null));
  }, [opId]);
  // план и итоги с сервера — в черновик, пока командир ничего не правит
  React.useEffect(() => {
    if (!op || dirty) return;
    setDraft(planInput(op.plan));
    setDebriefText(op.plan.debrief.text);
  }, [op, dirty]);

  if (!op) return null;
  const plan = op.plan;
  const canEdit = op.can_edit;
  const now = today();
  const started = op.date <= now;
  const fail = (err: unknown) => notify({ title: t("operations.saveFailed"), message: errorText(err, t("operations.saveFailed")), tone: "danger" });
  const apply = (next: Operation) => {
    onChange(next);
    setFull((prev) => (prev ? { ...prev, ...next } : prev));
  };
  const run = async (fn: () => Promise<Operation | void>) => {
    setBusy(true);
    try {
      const next = await fn();
      if (next) apply(next);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const people = op.participants;
  const mine = people.find((p) => p.user_id === me);
  const nameOf = (uid: string | null) => (uid ? people.find((p) => p.user_id === uid)?.name ?? full?.silent.find((m) => m.user_id === uid)?.name ?? (uid === op.author_id ? op.author_name : "—") : "");
  const roleName = (id: string | null) => plan.roles.find((r) => r.id === id)?.name;
  const squadName = (id: string | null) => plan.squads.find((s) => s.id === id)?.name;
  const goers = going(op);
  const filled = (role: string) => goers.filter((p) => p.role === role).length;
  const hidden = new Set(plan.hidden);
  const fmtDay = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(parseDate(op.date));
  const when = op.starts_at ? `${fmtDay}, ${new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(op.starts_at))}` : fmtDay;

  const answer = (status: AttendStatus | null, role?: string | null) =>
    run(() => operationsApi.attend(op.id, status, role === undefined ? mine?.role ?? null : role));
  const toggleDone = (s: PlanStage) => {
    setDraft((d) => (d ? { ...d, stages: d.stages.map((x) => (x.id === s.id ? { ...x, done: !s.done } : x)) } : d));
    void run(() => operationsApi.stageDone(op.id, s.id, !s.done));
  };
  const canTick = (s: PlanStage) => canEdit || (!!me && s.owner_id === me);

  /* ───────── черновик плана (командир) ───────── */
  const edit = (fn: (d: PlanInput) => PlanInput) => {
    setDraft((d) => (d ? fn(d) : d));
    setDirty(true);
  };
  const savePlan = () =>
    draft &&
    run(async () => {
      // этапы — по времени (без времени — в конце, в своём порядке)
      const stages = [...draft.stages].sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
      const next = await operationsApi.savePlan(op.id, { ...draft, stages });
      setDirty(false);
      notify({ title: t("opsPlan.title"), message: t("opsPlan.saved"), tone: "success" });
      return next;
    });
  const sectionToggle = (key: BriefSection, on: boolean) =>
    edit((d) => ({ ...d, hidden: on ? d.hidden.filter((h) => h !== key) : [...d.hidden, key] }));

  const postBrief = () =>
    run(async () => {
      // снимки карты — картинками, если раздел «Карты» не скрыт
      const images = hidden.has("maps") ? [] : [...shots.current.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
      const r = await operationsApi.postBrief(op.id, images);
      notify(r.posted
        ? { title: t("opsPlan.brief"), message: t("opsPlan.briefPosted"), tone: "success" }
        : { title: t("opsPlan.brief"), message: t("opsPlan.briefNoDiscord"), tone: "warning" });
    });
  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(briefRef.current?.innerText ?? "");
      notify({ title: t("opsPlan.brief"), message: t("opsPlan.copied"), tone: "success" });
    } catch (err) {
      fail(err);
    }
  };

  /* ───────── вкладки ───────── */

  const stageRow = (s: PlanStage) => (
    <li key={s.id} className={cn("ops-stage", s.done && "is-done")}>
      <input type="checkbox" checked={s.done} disabled={busy || !canTick(s)} onChange={() => toggleDone(s)} aria-label={t("opsPlan.stageDone")} />
      <span className="ops-stage-time">{s.time || "—"}</span>
      <span className="min-w-0 flex-1">
        <span className="ops-stage-title">{s.title}</span>
        {s.owner_id ? <span className="text-xs text-fg-3"> · {nameOf(s.owner_id)}</span> : null}
        {s.note ? <span className="block text-xs text-fg-3">{s.note}</span> : null}
      </span>
    </li>
  );

  const briefTab = () => {
    const stages = plan.stages.filter((s) => s.brief);
    const points = plan.points.filter((p) => p.brief);
    const maybe = people.filter((p) => p.status === "maybe");
    const supply = full?.supply ?? [];
    const done = supply.reduce((a, r) => a + r.delivered, 0);
    const total = supply.reduce((a, r) => a + r.ordered, 0);
    const skipped = plan.stages.length - stages.length + plan.points.length - points.length;
    return (
      <div className="flex flex-col gap-4">
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary h-9 min-h-0" disabled={busy} onClick={() => void postBrief()}>
              <Icon name="send" size={15} />
              {t("opsPlan.postBrief")}
            </button>
            <button type="button" className="btn h-9 min-h-0" onClick={() => void copyBrief()}>
              <Icon name="copy" size={15} />
              {t("opsPlan.copyBrief")}
            </button>
            {plan.hidden.length || skipped ? (
              <span className="text-xs text-fg-3">{t("opsPlan.hiddenNote", { n: plan.hidden.length + skipped })}</span>
            ) : null}
          </div>
        ) : null}
        <div ref={briefRef} className="ops-brief">
          <h3 className="section-title">{t("opsPlan.briefTitle", { title: op.title })}</h3>
          <p className="first-cap text-sm text-fg-2">{when}</p>
          {!hidden.has("note") && op.note ? <MentionText text={op.note} className="text-sm text-fg-2" /> : null}
          {!hidden.has("stages") && stages.length ? (
            <section>
              <h4 className="field-label">{t("opsPlan.stages")}</h4>
              <ol className="flex flex-col gap-1">{stages.map(stageRow)}</ol>
            </section>
          ) : null}
          {!hidden.has("points") && points.length ? (
            <section>
              <h4 className="field-label">{t("opsPlan.points")}</h4>
              <ul className="flex flex-col gap-1 text-sm">
                {points.map((p) => (
                  <li key={p.id}>{POINT_ICON[p.kind]} <b>{t(`opsPlan.point.${p.kind}`)}</b>{p.label ? `: ${p.label}` : ""}{p.note ? <span className="text-fg-3"> — {p.note}</span> : null}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {!hidden.has("maps") && op.snapshot_names.length ? (
            <section>
              <h4 className="field-label">{t("opsPlan.maps")}</h4>
              {full ? (
                <div className="ops-shots">
                  {full.snapshots.map((snap, i) => (
                    <SnapshotImage key={i} snapshot={toViewerSnapshot(op, snap, i)} structures={structures} orders={orders}
                      onOpen={() => onOpenMap(op, i)}
                      onBlob={(blob) => (blob ? shots.current.set(i, blob) : shots.current.delete(i))} />
                  ))}
                </div>
              ) : <Loading />}
            </section>
          ) : null}
          {!hidden.has("roles") && plan.roles.length ? (
            <section>
              <h4 className="field-label">{t("opsPlan.roles")}</h4>
              <ul className="flex flex-col gap-1 text-sm">
                {plan.roles.map((r) => (
                  <li key={r.id}><b>{r.name}</b> ({r.slots ? `${filled(r.id)}/${r.slots}` : filled(r.id)}): {goers.filter((p) => p.role === r.id).map((p) => p.name).join(", ") || "—"}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {!hidden.has("squads") && plan.squads.length ? (
            <section>
              <h4 className="field-label">{t("opsPlan.squads")}</h4>
              <ul className="flex flex-col gap-1 text-sm">
                {plan.squads.map((s) => (
                  <li key={s.id}><b>{s.name}</b>{s.leader_id ? ` (${t("opsPlan.leader")}: ${nameOf(s.leader_id)})` : ""}: {goers.filter((p) => p.squad === s.id).map((p) => p.name).join(", ") || "—"}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {!hidden.has("people") ? (
            <section className="text-sm">
              <div><b>{t("opsPlan.status.go")} ({goers.length}):</b> {goers.map((p) => p.name).join(", ") || "—"}</div>
              {maybe.length ? <div><b>{t("opsPlan.status.maybe")} ({maybe.length}):</b> {maybe.map((p) => p.name).join(", ")}</div> : null}
            </section>
          ) : null}
          {!hidden.has("supply") && supply.length ? (
            <section className="text-sm">
              <h4 className="field-label">{t("opsPlan.supplyPct", { pct: total ? Math.round((100 * done) / total) : 0 })}</h4>
              <ul>{supply.map((r) => <li key={r.report_id}>{r.title}: {r.delivered}/{r.ordered}</li>)}</ul>
            </section>
          ) : null}
          {plan.debrief.outcome || plan.debrief.text ? (
            <section className="text-sm">
              <h4 className="field-label">{t("opsPlan.debrief")}</h4>
              {plan.debrief.outcome ? <div className="font-semibold">{t(`opsPlan.outcome.${plan.debrief.outcome}`)}</div> : null}
              {plan.debrief.text ? <p className="whitespace-pre-wrap text-fg-2">{plan.debrief.text}</p> : null}
            </section>
          ) : null}
        </div>
      </div>
    );
  };

  const personRow = (p: Participant) => (
    <li key={p.user_id} className="ops-person">
      <span className="min-w-0 flex-1">
        <span className="font-semibold text-fg">{p.name}</span>
        {!canEdit && (roleName(p.role) || squadName(p.squad)) ? (
          <span className="text-xs text-fg-3"> · {[roleName(p.role), squadName(p.squad)].filter(Boolean).join(" · ")}</span>
        ) : null}
        <span className="block text-xs text-fg-3">{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(p.at))}</span>
      </span>
      {canEdit && p.status !== "no" ? (
        <span className="flex flex-wrap items-center gap-1.5">
          {plan.roles.length ? (
            <select className="field h-8 w-auto py-0 text-xs" value={p.role ?? ""} disabled={busy} aria-label={t("opsPlan.role")}
              onChange={(e) => void run(() => operationsApi.assign(op.id, { user_id: p.user_id, role: e.target.value || null }))}>
              <option value="">{t("opsPlan.noRole")}</option>
              {plan.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          ) : null}
          {plan.squads.length ? (
            <select className="field h-8 w-auto py-0 text-xs" value={p.squad ?? ""} disabled={busy} aria-label={t("opsPlan.squad")}
              onChange={(e) => void run(() => operationsApi.assign(op.id, { user_id: p.user_id, squad: e.target.value || null }))}>
              <option value="">{t("opsPlan.noSquad")}</option>
              {plan.squads.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : null}
        </span>
      ) : null}
      {canEdit && started && p.status !== "no" ? (
        <label className="flex items-center gap-1 text-xs text-fg-2">
          <input type="checkbox" checked={p.attended === true} disabled={busy}
            onChange={(e) => void run(() => operationsApi.assign(op.id, { user_id: p.user_id, attended: e.target.checked }))} />
          {t("opsPlan.attended")}
        </label>
      ) : null}
    </li>
  );

  const peopleTab = () => (
    <div className="flex flex-col gap-4">
      {plan.roles.length ? (
        <div className="ops-roles">
          {plan.roles.map((r) => {
            const n = filled(r.id);
            return (
              <div key={r.id} className="ops-role">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-fg">{r.name}</span>
                  <span className={cn("text-sm tabular-nums", r.slots && n >= r.slots ? "text-accent" : "text-fg-2")}>{r.slots ? `${n}/${r.slots}` : n}</span>
                </div>
                {r.slots ? <div className="ops-bar"><span style={{ width: `${Math.min(100, (100 * n) / r.slots)}%` }} /></div> : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {STATUSES.map((st) => {
        const list = people.filter((p) => p.status === st);
        return (
          <section key={st}>
            <h4 className="field-label">{t(`opsPlan.status.${st}`)} · {list.length}</h4>
            {list.length ? <ul className="flex flex-col gap-1.5">{list.map(personRow)}</ul> : <p className="text-sm text-fg-3">—</p>}
          </section>
        );
      })}
      <section>
        <h4 className="field-label">{t("opsPlan.silent")} · {full ? full.silent.length : "…"}</h4>
        {full ? <p className="text-sm text-fg-3">{full.silent.map((m) => m.name).join(", ") || "—"}</p> : <Loading />}
      </section>
    </div>
  );

  const planTab = () => {
    if (!draft) return null;
    if (!canEdit) {
      return (
        <div className="flex flex-col gap-4">
          <section>
            <h4 className="field-label">{t("opsPlan.stages")}</h4>
            {plan.stages.length ? <ol className="flex flex-col gap-1">{plan.stages.map(stageRow)}</ol> : <p className="text-sm text-fg-3">{t("opsPlan.noStages")}</p>}
          </section>
          <p className="text-xs text-fg-3">{t("opsPlan.readOnly")}</p>
        </div>
      );
    }
    const owners = [...people.filter((p) => p.status !== "no"), ...(people.some((p) => p.user_id === op.author_id) ? [] : [{ user_id: op.author_id, name: op.author_name }])];
    return (
      <div className="flex flex-col gap-5">
        <section>
          <h4 className="field-label">{t("opsPlan.sections")}</h4>
          <p className="mb-2 text-xs text-fg-3">{t("opsPlan.sectionsHint")}</p>
          <div className="flex flex-wrap gap-1.5">
            {BRIEF_SECTIONS.map((key) => {
              const on = !draft.hidden.includes(key);
              return (
                <button key={key} type="button" className={cn("ops-chip ops-section", !on && "is-off")} aria-pressed={on} onClick={() => sectionToggle(key, !on)}>
                  <Icon name="eye" size={13} />
                  {t(`opsPlan.section.${key}`)}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h4 className="field-label">{t("opsPlan.stages")}</h4>
          <ul className="flex flex-col gap-2">
            {draft.stages.map((s, i) => {
              const set = (patch: Partial<PlanStage>) => edit((d) => ({ ...d, stages: d.stages.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
              return (
                <li key={s.id} className={cn("ops-edit-row", !s.brief && "is-hidden")}>
                  <input type="checkbox" checked={s.done} disabled={busy} onChange={() => toggleDone(s)} aria-label={t("opsPlan.stageDone")} title={t("opsPlan.stageDone")} />
                  <input type="time" className="field h-8 w-[6.5rem] px-2 py-0 text-sm" value={s.time} onChange={(e) => set({ time: e.target.value })} aria-label={t("operations.time")} />
                  <input className="field h-8 min-w-[10rem] flex-1 py-0 text-sm" value={s.title} maxLength={120} placeholder={t("opsPlan.stageTitle")} onChange={(e) => set({ title: e.target.value })} />
                  <select className="field h-8 w-auto py-0 text-sm" value={s.owner_id ?? ""} onChange={(e) => set({ owner_id: e.target.value || null })} aria-label={t("opsPlan.owner")}>
                    <option value="">{t("opsPlan.noOwner")}</option>
                    {owners.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
                  </select>
                  <input className="field h-8 min-w-[8rem] flex-1 py-0 text-sm" value={s.note} maxLength={300} placeholder={t("opsPlan.stageNote")} onChange={(e) => set({ note: e.target.value })} />
                  <BriefToggle on={s.brief} onChange={(brief) => set({ brief })} />
                  <button type="button" className="icon-btn" onClick={() => edit((d) => ({ ...d, stages: d.stages.filter((_, j) => j !== i) }))} aria-label={t("common.delete")}><Icon name="trash" size={15} /></button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn mt-2 h-8 min-h-0 text-sm" disabled={draft.stages.length >= 40}
            onClick={() => edit((d) => ({ ...d, stages: [...d.stages, { id: planId(), time: "", title: "", note: "", owner_id: null, done: false, brief: true }] }))}>
            <Icon name="plus" size={14} />
            {t("opsPlan.addStage")}
          </button>
        </section>

        <section>
          <h4 className="field-label">{t("opsPlan.points")}</h4>
          <p className="mb-2 text-xs text-fg-3">{t("opsPlan.pointsHint")}</p>
          {draft.points.length ? (
            <ul className="flex flex-col gap-1.5">
              {draft.points.map((p, i) => (
                <li key={p.id} className={cn("ops-person", !p.brief && "opacity-60")}>
                  <span className="min-w-0 flex-1 text-sm">
                    {POINT_ICON[p.kind]} <b>{t(`opsPlan.point.${p.kind}`)}</b>{p.label ? `: ${p.label}` : ""}
                    {p.note ? <span className="block text-xs text-fg-3">{p.note}</span> : null}
                  </span>
                  {p.snapshot !== null && op.snapshot_names[p.snapshot] !== undefined ? (
                    <button type="button" className="icon-btn" onClick={() => onOpenMap(op, p.snapshot!)} title={t("operations.openMap")} aria-label={t("operations.openMap")}><Icon name="map" size={15} /></button>
                  ) : null}
                  <BriefToggle on={p.brief} onChange={(brief) => edit((d) => ({ ...d, points: d.points.map((x, j) => (j === i ? { ...x, brief } : x)) }))} />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-fg-3">{t("opsPlan.noPoints")}</p>}
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          <section>
            <h4 className="field-label">{t("opsPlan.roles")}</h4>
            <p className="mb-2 text-xs text-fg-3">{t("opsPlan.rolesHint")}</p>
            <ul className="flex flex-col gap-2">
              {draft.roles.map((r, i) => (
                <li key={r.id} className="ops-edit-row">
                  <input className="field h-8 min-w-0 flex-1 py-0 text-sm" value={r.name} maxLength={40} placeholder={t("opsPlan.roleName")}
                    onChange={(e) => edit((d) => ({ ...d, roles: d.roles.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))} />
                  <input type="number" min={0} max={100} className="field h-8 w-[4.5rem] px-2 py-0 text-sm" value={r.slots} aria-label={t("opsPlan.slots")} title={t("opsPlan.slots")}
                    onChange={(e) => edit((d) => ({ ...d, roles: d.roles.map((x, j) => (j === i ? { ...x, slots: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } : x)) }))} />
                  <button type="button" className="icon-btn" onClick={() => edit((d) => ({ ...d, roles: d.roles.filter((_, j) => j !== i) }))} aria-label={t("common.delete")}><Icon name="trash" size={15} /></button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn mt-2 h-8 min-h-0 text-sm" disabled={draft.roles.length >= 12}
              onClick={() => edit((d) => ({ ...d, roles: [...d.roles, { id: planId(), name: "", slots: 0 }] }))}>
              <Icon name="plus" size={14} />
              {t("opsPlan.addRole")}
            </button>
          </section>
          <section>
            <h4 className="field-label">{t("opsPlan.squads")}</h4>
            <p className="mb-2 text-xs text-fg-3">{t("opsPlan.squadsHint")}</p>
            <ul className="flex flex-col gap-2">
              {draft.squads.map((s, i) => (
                <li key={s.id} className="ops-edit-row">
                  <input className="field h-8 min-w-0 flex-1 py-0 text-sm" value={s.name} maxLength={40} placeholder={t("opsPlan.squadName")}
                    onChange={(e) => edit((d) => ({ ...d, squads: d.squads.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))} />
                  <select className="field h-8 w-[8rem] py-0 text-sm" value={s.leader_id ?? ""} aria-label={t("opsPlan.leader")}
                    onChange={(e) => edit((d) => ({ ...d, squads: d.squads.map((x, j) => (j === i ? { ...x, leader_id: e.target.value || null } : x)) }))}>
                    <option value="">{t("opsPlan.noLeader")}</option>
                    {owners.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
                  </select>
                  <button type="button" className="icon-btn" onClick={() => edit((d) => ({ ...d, squads: d.squads.filter((_, j) => j !== i) }))} aria-label={t("common.delete")}><Icon name="trash" size={15} /></button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn mt-2 h-8 min-h-0 text-sm" disabled={draft.squads.length >= 12}
              onClick={() => edit((d) => ({ ...d, squads: [...d.squads, { id: planId(), name: "", leader_id: null }] }))}>
              <Icon name="plus" size={14} />
              {t("opsPlan.addSquad")}
            </button>
          </section>
        </div>
      </div>
    );
  };

  const supplyTab = () => {
    if (!full) return <Loading />;
    const done = full.supply.reduce((a, r) => a + r.delivered, 0);
    const total = full.supply.reduce((a, r) => a + r.ordered, 0);
    if (!full.supply.length) return <p className="text-sm text-fg-3">{t("opsPlan.noSupply")}</p>;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="font-semibold text-fg">{t("opsPlan.supplyPct", { pct: total ? Math.round((100 * done) / total) : 0 })}</span>
          <span className="text-sm tabular-nums text-fg-2">{done}/{total}</span>
        </div>
        <ul className="flex flex-col gap-2">
          {full.supply.map((r) => (
            <li key={r.report_id} className="ops-role">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate font-semibold text-fg">{r.title}</span>
                <span className="shrink-0 text-xs text-fg-3">{t(REPORT_STATUS_LABEL[r.status as keyof typeof REPORT_STATUS_LABEL] ?? "common.loading")} · <span className="tabular-nums">{r.delivered}/{r.ordered}</span></span>
              </div>
              <div className="ops-bar"><span style={{ width: `${r.ordered ? Math.min(100, (100 * r.delivered) / r.ordered) : 0}%` }} /></div>
              {r.delivered < r.ordered ? <span className="text-xs text-warn">{t("opsPlan.short", { n: r.ordered - r.delivered })}</span> : null}
            </li>
          ))}
        </ul>
        <p className="text-xs text-fg-3">{t("opsPlan.supplyHint")}</p>
        {shortageBlock()}
      </div>
    );
  };

  const iconOf = (code: string | null) => (code ? orders.flatMap((o) => o.lines).find((l) => l.item_code === code)?.icon_url ?? null : null);
  const shortageBlock = () => {
    const list = full ? shortages(full.supply) : [];
    if (!list.length) return null;
    const chosen = picked ?? new Set<string>();
    const startOrder = () => {
      const lines = list.filter((s) => chosen.has(s.key)).map((s) => ({ name: s.name, item_code: s.item_code, quantity: s.missing, unit: s.unit, icon_url: iconOf(s.item_code) }));
      if (lines.length) setOrderLines(lines);
    };
    return (
      <section className="ops-brief">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="field-label">{t("opsPlan.shortage", { n: list.length })}</h4>
          {canOrder && !picked ? (
            <button type="button" className="btn h-8 min-h-0 text-sm" onClick={() => setPicked(new Set(list.filter((s) => s.closed > 0).map((s) => s.key).concat(list.some((s) => s.closed > 0) ? [] : list.map((s) => s.key))))}>
              <Icon name="plus" size={14} />
              {t("opsPlan.orderShortage")}
            </button>
          ) : null}
        </div>
        <ul className="flex flex-col gap-1">
          {list.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-sm">
              {picked ? (
                <input type="checkbox" checked={chosen.has(s.key)} aria-label={s.name}
                  onChange={(e) => setPicked((prev) => { const next = new Set(prev); if (e.target.checked) next.add(s.key); else next.delete(s.key); return next; })} />
              ) : null}
              <span className="min-w-0 flex-1 truncate text-fg">{s.name}</span>
              <b className="tabular-nums">{s.missing}</b>
              <span className="w-[11rem] shrink-0 text-right text-xs text-fg-3">
                {[s.open ? t("opsPlan.shortOpen", { n: s.open }) : "", s.closed ? t("opsPlan.shortClosed", { n: s.closed }) : ""].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
        {picked ? (
          <>
            <p className="text-xs text-fg-3">{t("opsPlan.shortageHint")}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn h-8 min-h-0 text-sm" onClick={() => setPicked(null)}>{t("common.cancel")}</button>
              <button type="button" className="btn btn-primary h-8 min-h-0 text-sm" disabled={!chosen.size} onClick={startOrder}>
                <Icon name="send" size={14} />
                {t("opsPlan.orderPicked", { n: chosen.size })}
              </button>
            </div>
          </>
        ) : null}
      </section>
    );
  };
  const orderSent = async (report: Report) => {
    setOrderLines(null);
    setPicked(null);
    try {
      // заказ — к этой операции, срок — день операции, приоритет высокий
      await reportApi.setTask(report.id, { operation_id: op.id, due_date: op.date, priority: "high" });
      setFull(await operationsApi.get(op.id));
      notify({ title: t("opsPlan.title"), message: t("opsPlan.orderLinked", { title: report.title }), tone: "success" });
    } catch (err) {
      fail(err);
    }
  };

  const debriefTab = () => {
    const expected = people.filter((p) => p.status !== "no");
    const came = people.filter((p) => p.attended === true).length;
    return (
      <div className="flex flex-col gap-4">
        <section>
          <h4 className="field-label">{t("opsPlan.outcomeLabel")}</h4>
          <div className="segmented">
            {OUTCOMES.map((o) => (
              <button key={o} type="button" disabled={!canEdit || busy} className={cn("segmented-item", plan.debrief.outcome === o && "is-active")}
                onClick={() => void run(() => operationsApi.saveDebrief(op.id, { outcome: plan.debrief.outcome === o ? null : o, text: plan.debrief.text }))}>
                {t(`opsPlan.outcome.${o}`)}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h4 className="field-label">{t("opsPlan.debriefNotes")}</h4>
          {canEdit ? (
            <>
              <textarea className="field min-h-[6rem] w-full text-sm" maxLength={2000} value={debriefText} onChange={(e) => setDebriefText(e.target.value)} placeholder={t("opsPlan.debriefPh")} />
              <button type="button" className="btn mt-2 h-8 min-h-0 text-sm" disabled={busy || debriefText === plan.debrief.text}
                onClick={() => void run(() => operationsApi.saveDebrief(op.id, { outcome: plan.debrief.outcome, text: debriefText }))}>
                <Icon name="check" size={14} />
                {t("common.save")}
              </button>
            </>
          ) : <p className="whitespace-pre-wrap text-sm text-fg-2">{plan.debrief.text || "—"}</p>}
        </section>
        <section>
          <h4 className="field-label">{t("opsPlan.attendance", { came, n: expected.length })}</h4>
          {!started ? <p className="text-sm text-fg-3">{t("opsPlan.attendanceLater")}</p> : (
            <ul className="flex flex-col gap-1.5">
              {expected.map((p) => (
                <li key={p.user_id} className="ops-person">
                  <span className="min-w-0 flex-1 font-semibold text-fg">{p.name} <span className="text-xs font-normal text-fg-3">· {t(`opsPlan.status.${p.status}`)}</span></span>
                  <label className="flex items-center gap-1 text-xs text-fg-2">
                    <input type="checkbox" checked={p.attended === true} disabled={!canEdit || busy}
                      onChange={(e) => void run(() => operationsApi.assign(op.id, { user_id: p.user_id, attended: e.target.checked }))} />
                    {t("opsPlan.attended")}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-fg-3">{t("opsPlan.attendanceHint")}</p>
        </section>
      </div>
    );
  };

  return (
    <Modal open={!!op} onClose={onClose} title={op.title} icon="alarm" widthClass="max-w-4xl"
      footer={canEdit && tab === "plan" && dirty ? (
        <div className="flex w-full items-center justify-end gap-2">
          <span className="mr-auto text-xs text-warn">{t("opsPlan.unsaved")}</span>
          <button type="button" className="btn" disabled={busy} onClick={() => { setDirty(false); setDraft(planInput(op.plan)); }}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-primary" disabled={busy || !draft || [...draft.stages, ...draft.roles, ...draft.squads].some((x) => !("title" in x ? x.title : x.name).trim())} onClick={() => void savePlan()}>
            <Icon name="check" size={15} />
            {t("common.save")}
          </button>
        </div>
      ) : undefined}>
      <div className="flex flex-col gap-4">
        {/* мой ответ */}
        <div className="ops-rsvp">
          <span className="first-cap text-sm text-fg-2">{when}</span>
          {op.date >= now ? (
            <span className="flex flex-wrap items-center gap-2">
              <div className="segmented" role="group" aria-label={t("opsPlan.myAnswer")}>
                {STATUSES.map((st) => (
                  <button key={st} type="button" disabled={busy} className={cn("segmented-item", mine?.status === st && "is-active")}
                    onClick={() => void answer(mine?.status === st ? null : st)}>
                    {t(`opsPlan.answer.${st}`)}
                  </button>
                ))}
              </div>
              {plan.roles.length && mine && mine.status !== "no" ? (
                <select className="field h-9 w-auto py-0 text-sm" value={mine.role ?? ""} disabled={busy} aria-label={t("opsPlan.myRole")}
                  onChange={(e) => void answer(mine.status, e.target.value || null)}>
                  <option value="">{t("opsPlan.myRole")}</option>
                  {plan.roles.map((r) => {
                    const full = !!r.slots && filled(r.id) >= r.slots && mine.role !== r.id;
                    return <option key={r.id} value={r.id} disabled={full}>{r.name}{r.slots ? ` (${filled(r.id)}/${r.slots})` : ""}</option>;
                  })}
                </select>
              ) : null}
            </span>
          ) : null}
        </div>

        <div className="segmented self-start overflow-x-auto" role="tablist">
          {TABS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={cn("segmented-item", tab === k && "is-active")} onClick={() => setTab(k)}>
              {t(`opsPlan.tab.${k}`)}
              {k === "people" ? ` · ${goers.length}` : ""}
            </button>
          ))}
        </div>

        <SendOrderDialog open={!!orderLines} lines={orderLines ?? []} defaultKind="stockpile" onClose={() => setOrderLines(null)} onSent={(r) => void orderSent(r)} />
        {tab === "brief" ? briefTab() : tab === "people" ? peopleTab() : tab === "plan" ? planTab() : tab === "supply" ? supplyTab() : debriefTab()}
      </div>
    </Modal>
  );
};
