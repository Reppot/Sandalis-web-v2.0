"use client";

import * as React from "react";
import { operationsApi, parseDate, today, toViewerSnapshot, type Operation } from "@/features/operations/model/operations";
import { OperationDialog } from "@/features/operations/ui/OperationDialog";
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
 * (интерактивный), заказы на снимке, опрос «отметьтесь участником»; и сводка заказов в операциях.
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
  const [showPast, setShowPast] = React.useState(false);
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
  // заказы, задействованные в операциях, — сводка
  const involved = new Map<string, Operation[]>();
  for (const op of upcoming) for (const id of op.report_ids) involved.set(id, [...(involved.get(id) ?? []), op]);

  const attend = async (op: Operation, going: boolean) => {
    try {
      replace(await operationsApi.attend(op.id, going));
    } catch (err) {
      notify({ title: t("operations.saveFailed"), message: errorText(err, t("operations.saveFailed")), tone: "danger" });
    }
  };
  const reschedule = async (op: Operation, date: string) => {
    if (!date) return;
    try {
      replace(await operationsApi.update(op.id, { title: op.title, date, note: op.note }));
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
  const openMap = async (op: Operation) => {
    try {
      const full = await operationsApi.get(op.id);
      if (full.snapshot) setViewing({ snap: toViewerSnapshot(op, full.snapshot), op });
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
                    <span className="text-xs text-fg-3">{t("operations.participants", { n: o.participants.length })}{o.has_snapshot ? ` · ${t("operations.hasMap")}` : ""}</span>
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
              const going = op.participants.some((p) => p.user_id === session?.userId);
              return (
                <article key={op.id} className={cn("panel ops-card", op.date === day && "is-picked")}>
                  <header className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="page-eyebrow first-cap">{fmt(op.date, { weekday: "short", day: "numeric", month: "long" })}</div>
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

                  {op.has_snapshot ? (
                    <button type="button" className="ops-map-btn" onClick={() => void openMap(op)}>
                      <Icon name="map" size={18} />
                      <span>{t("operations.openMap")}</span>
                    </button>
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

                  {/* опрос активности */}
                  <footer className="ops-poll">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-fg">{t("operations.participants", { n: op.participants.length })}</div>
                      <div className="truncate text-xs text-fg-3">{op.participants.map((p) => p.name).join(", ") || t("operations.nobody")}</div>
                    </div>
                    {op.date >= now ? (
                      <button type="button" className={cn("btn h-9 min-h-0", going ? "" : "btn-primary")} onClick={() => void attend(op, !going)}>
                        <Icon name={going ? "close" : "check"} size={15} />
                        {going ? t("operations.leave") : t("operations.join")}
                      </button>
                    ) : null}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* заказы, задействованные в предстоящих операциях */}
      <section className="panel p-4 md:p-5">
        <h2 className="section-title">{t("operations.ordersTitle")}</h2>
        {involved.size ? (
          <ul className="mt-3 flex flex-col divide-y divide-[var(--border)]">
            {[...involved.entries()].map(([id, ops]) => {
              const r = reportById.get(id);
              return (
                <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="font-medium text-fg">{r?.title ?? t("planning.orderGone")}</span>
                    {r ? <span className="ml-2 text-xs text-fg-3">{t(REPORT_STATUS_LABEL[r.status])}{r.meta?.region ? ` · ${r.meta.region}` : ""}</span> : null}
                  </span>
                  <span className="text-xs text-fg-3">{ops.map((o) => `${o.title} (${fmt(o.date, { day: "numeric", month: "short" })})`).join(", ")}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-fg-3">{t("operations.ordersEmpty")}</p>
        )}
      </section>

      <OperationDialog open={creating} onClose={() => setCreating(false)} initialDate={day} onCreated={(op) => setList((prev) => [...(prev ?? []), op].sort((a, b) => a.date.localeCompare(b.date)))} />
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
