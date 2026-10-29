"use client";

import * as React from "react";
import { going, nextStage, operationsApi, parseDate, today, toViewerSnapshot, type AttendStatus, type Operation, type OperationSnapshot, startsAt, startTime } from "@/features/operations/model/operations";
import { OperationDialog } from "@/features/operations/ui/OperationDialog";
import { OperationPlanDialog } from "@/features/operations/ui/OperationPlanDialog";
import { OperationsCalendar } from "@/features/operations/ui/OperationsCalendar";
import { useStructureCatalog, type Snapshot } from "@/features/planning/model/plan";
import { SnapshotViewer } from "@/features/planning/ui/SnapshotViewer";
import { useSession } from "@/features/cabinet";
import { MentionText } from "@/features/mail/ui/Mentions";
import { REPORT_STATUS_LABEL, reportApi, type Report } from "@/entities/report";
import { EmptyState, Icon, Loading, cn, errorText, useConfirm, useI18n, useNotify } from "@/shared";

/**
 * «Операции» клана. Шапка — календарь с занятыми днями (в дне — названия операций) и выбором
 * даты новой операции. Ниже — операции выбранного периода: снимок карты из «Планирования»
 * (интерактивные, их может быть несколько), заказы на снимках, опрос «отметьтесь участником».
 * Сводка заказов операций — в «Заказах клана», фильтр «Операции».
 */
export const OperationsWorkspace: React.FC<{ onOpenPlanning: () => void }> = ({ onOpenPlanning }) => {
  const { t, locale } = useI18n();
  const notify = useNotify();
  const { session } = useSession();
  const [list, setList] = React.useState<Operation[] | null>(null);
  const [canCreate, setCanCreate] = React.useState(false);
  const [reports, setReports] = React.useState<Report[]>([]);
  const [day, setDay] = React.useState<string>(today());
  const [creating, setCreating] = React.useState(false);
  const [viewing, setViewing] = React.useState<{ snap: Snapshot; op: Operation } | null>(null);
  // снимки открытой операции грузим один раз
  const fullCache = React.useRef(new Map<string, OperationSnapshot[]>());
  const [showPast, setShowPast] = React.useState(false);
  const [planOf, setPlanOf] = React.useState<string | null>(null);
  const { structures } = useStructureCatalog();
  const [armed, confirm] = useConfirm();

  const load = React.useCallback(() => {
    operationsApi
      .list()
      .then((r) => {
        setList(r.operations);
        setCanCreate(r.can_create);
      })
      .catch((err) => {
        setList([]);
        notify({ title: t("operations.loadFailed"), message: errorText(err, t("operations.loadFailed")), tone: "danger" });
      });
    // все заказы клана: метки на снимках ссылаются и на закрытые
    reportApi.list().then(setReports).catch(() => setReports([]));
  }, [notify, t]);
  React.useEffect(() => load(), [load]);

  const replace = (op: Operation) => setList((prev) => (prev ?? []).map((x) => (x.id === op.id ? op : x)));
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, opts).format(parseDate(d));
  const reportById = React.useMemo(() => new Map(reports.map((r) => [r.id, r])), [reports]);

  if (!list) return <div className="panel"><Loading label={t("operations.loading")} /></div>;

  const now = today();
  const dayOps = list.filter((o) => o.date === day);
  const upcoming = list.filter((o) => o.date >= now);
  const past = list.filter((o) => o.date < now).reverse();
  const shown = showPast ? past : upcoming;

  const attend = async (op: Operation, status: AttendStatus | null) => {
    try {
      // роль, выбранная в плане, сохраняется
      replace(await operationsApi.attend(op.id, status, op.participants.find((p) => p.user_id === session?.userId)?.role ?? null));
    } catch (err) {
      notify({ title: t("operations.saveFailed"), message: errorText(err, t("operations.saveFailed")), tone: "danger" });
    }
  };
  const reschedule = async (op: Operation, date: string) => {
    if (!date) return;
    try {
      // перенос дня сохраняет время начала
      replace(await operationsApi.update(op.id, { title: op.title, date, note: op.note, starts_at: startsAt(date, startTime(op)) }));
    } catch (err) {
      notify({ title: t("operations.saveFailed"), message: errorText(err, t("operations.saveFailed")), tone: "danger" });
    }
  };
  const remove = async (op: Operation) => {
    try {
      await operationsApi.remove(op.id);
      setList((prev) => (prev ?? []).filter((x) => x.id !== op.id));
    } catch (err) {
      notify({ title: t("operations.saveFailed"), message: errorText(err, t("operations.saveFailed")), tone: "danger" });
    }
  };
  const openMap = async (op: Operation, i: number) => {
    try {
      let snaps = fullCache.current.get(op.id);
      if (!snaps || snaps.length !== op.snapshot_names.length) {
        snaps = (await operationsApi.get(op.id)).snapshots;
        fullCache.current.set(op.id, snaps);
      }
      if (snaps[i]) setViewing({ snap: toViewerSnapshot(op, snaps[i], i), op });
    } catch (err) {
      notify({ title: t("operations.loadFailed"), message: errorText(err, t("operations.loadFailed")), tone: "danger" });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* шапка раздела — календарь операций */}
      <section className="panel p-4 md:p-5">
        <div className="ops-top">
          <OperationsCalendar operations={list} selected={day} onSelect={setDay} />
          <aside className="ops-day">
            <div className="page-eyebrow first-cap">{fmt(day, { weekday: "long" })}</div>
            <h2 className="section-title first-cap">{fmt(day, { day: "numeric", month: "long", year: "numeric" })}</h2>
            {dayOps.length ? (
              <ul className="mt-3 flex flex-col gap-2">
                {dayOps.map((o) => (
                  <li key={o.id} className="ops-day-item">
                    <span className="font-semibold text-fg">{o.title}</span>
                    <span className="text-xs text-fg-3">{t("operations.participants", { n: o.participants.length })}{o.snapshot_names.length ? ` · ${t("operations.maps", { n: o.snapshot_names.length })}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-fg-3">{t("operations.dayFree")}</p>
            )}
            {canCreate ? (
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" className="btn btn-primary" disabled={day < now} onClick={() => setCreating(true)}>
                  <Icon name="plus" size={16} />
                  {t("operations.newOnDay")}
                </button>
                <button type="button" className="btn" onClick={onOpenPlanning}>
                  <Icon name="map" size={16} />
                  {t("operations.fromPlanning")}
                </button>
                <p className="text-xs text-fg-3">{t("operations.fromPlanningHint")}</p>
              </div>
            ) : null}
          </aside>
        </div>
      </section>

      {/* операции */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">{showPast ? t("operations.past") : t("operations.upcoming")}</h2>
          <div className="segmented">
            <button type="button" className={cn("segmented-item", !showPast && "is-active")} onClick={() => setShowPast(false)}>{t("operations.upcoming")} · {upcoming.length}</button>
            <button type="button" className={cn("segmented-item", showPast && "is-active")} onClick={() => setShowPast(true)}>{t("operations.past")} · {past.length}</button>
          </div>
        </div>
        {shown.length === 0 ? (
          <div className="panel"><EmptyState icon="alarm" title={t("operations.empty")} hint={canCreate ? t("operations.emptyHint") : undefined} /></div>
        ) : (
          <div className="ops-grid">
            {shown.map((op) => {
              const my = op.participants.find((p) => p.user_id === session?.userId)?.status;
              const goers = going(op);
              const maybe = op.participants.filter((p) => p.status === "maybe").length;
              const no = op.participants.filter((p) => p.status === "no").length;
              const next = nextStage(op);
              return (
                <article key={op.id} className={cn("panel ops-card", op.date === day && "is-picked")}>
                  <header className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="page-eyebrow first-cap">{fmt(op.date, { weekday: "short", day: "numeric", month: "long" })}{op.starts_at ? ` · ${startTime(op)}` : ""}</div>
                      <h3 className="ops-card-title">{op.title}</h3>
                      <div className="text-xs text-fg-3">{t("operations.by", { name: op.author_name })}</div>
                    </div>
                    {op.can_edit ? (
                      <span className="flex items-center gap-1">
                        <input type="date" className="field h-8 w-[9.5rem] px-2 py-0 text-xs" value={op.date} onChange={(e) => void reschedule(op, e.target.value)} aria-label={t("operations.reschedule")} title={t("operations.reschedule")} />
                        <button type="button" className={cn("icon-btn", armed === op.id && "text-danger")} onClick={() => confirm(op.id, () => void remove(op))} aria-label={t("common.delete")} title={armed === op.id ? t("common.confirmQ") : t("common.delete")}><Icon name="trash" size={15} /></button>
                      </span>
                    ) : null}
                  </header>
                  {op.note ? <MentionText text={op.note} className="text-sm text-fg-2" /> : null}

                  {op.snapshot_names.length ? (
                    <div className="ops-maps">
                      {op.snapshot_names.map((name, i) => (
                        <button key={i} type="button" className="ops-map-btn" onClick={() => void openMap(op, i)}>
                          <Icon name="map" size={18} />
                          <span className="min-w-0 truncate">{name || t("operations.openMap")}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {op.report_ids.length ? (
                    <div className="flex flex-col gap-1">
                      <span className="field-label">{t("operations.orders")}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {op.report_ids.map((id) => {
                          const r = reportById.get(id);
                          return <span key={id} className={cn("ops-chip", r && `status-${r.status}`)}>{r ? `${r.title} · ${t(REPORT_STATUS_LABEL[r.status])}` : t("planning.orderGone")}</span>;
                        })}
                      </div>
                    </div>
                  ) : null}

                  {next ? (
                    <div className="ops-next text-sm">
                      <Icon name="clock" size={14} />
                      <span className="text-fg-3">{t("opsPlan.next")}:</span>
                      <span className="min-w-0 truncate text-fg">{next.time ? `${next.time} · ` : ""}{next.title}</span>
                    </div>
                  ) : null}

                  {/* опрос активности */}
                  <footer className="ops-poll">
                    <button type="button" className="ops-poll-who" onClick={() => setPlanOf(op.id)} title={t("opsPlan.open")}>
                      <span className="text-sm font-semibold text-fg">
                        {t("opsPlan.status.go")}: {goers.length}
                        {maybe ? <span className="font-normal text-fg-2"> · {t("opsPlan.status.maybe")}: {maybe}</span> : null}
                        {no ? <span className="font-normal text-fg-3"> · {t("opsPlan.status.no")}: {no}</span> : null}
                      </span>
                      <span className="block truncate text-xs text-fg-3">{goers.map((p) => p.name).join(", ") || t("operations.nobody")}</span>
                    </button>
                    {op.date >= now ? (
                      <div className="segmented" role="group" aria-label={t("opsPlan.myAnswer")}>
                        {(["go", "maybe", "no"] as const).map((st) => (
                          <button key={st} type="button" className={cn("segmented-item", my === st && "is-active")} onClick={() => void attend(op, my === st ? null : st)}>
                            {t(`opsPlan.answer.${st}`)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </footer>
                  <button type="button" className="btn h-9 min-h-0" onClick={() => setPlanOf(op.id)}>
                    <Icon name="list" size={15} />
                    {t("opsPlan.open")}
                    {op.plan.stages.length ? <span className="text-xs text-fg-3">· {t("opsPlan.stagesN", { n: op.plan.stages.length })}</span> : null}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <OperationDialog open={creating} onClose={() => setCreating(false)} initialDate={day} onCreated={(op) => setList((prev) => [...(prev ?? []), op].sort((a, b) => a.date.localeCompare(b.date)))} />
      <OperationPlanDialog op={list.find((o) => o.id === planOf) ?? null} onClose={() => setPlanOf(null)} onChange={replace} onOpenMap={(op, i) => void openMap(op, i)} />
      <SnapshotViewer
        snapshot={viewing?.snap ?? null}
        onClose={() => setViewing(null)}
        structures={structures}
        orders={reports}
        subtitle={viewing ? fmt(viewing.op.date, { weekday: "long", day: "numeric", month: "long" }) : undefined}
      />
    </div>
  );
};
