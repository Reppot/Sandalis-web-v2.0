"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { codeSynonyms } from "@/entities/item";
import { Scopes, type Can } from "@/entities/session";
import { operationsApi, today, type Operation } from "@/features/operations/model/operations";
import { NO_FACETS, VIEWS, applyFacets, applyView, sortTasks, summarize, type Facets, type View } from "@/features/reports/model/hq";
import { HqSummary, OperationsStrip, TaskRow } from "@/features/reports/ui/HqParts";
import { OrderCard } from "@/features/reports/ui/OrderCard";
import { BoardView, CalendarView } from "@/features/reports/ui/HqViews";
import { PRIORITIES, lineName, orderKindOf, REPORT_STATUS_LABEL, REPORT_TRANSITIONS, orderDraft, reportApi, type Assignee, type Report, type ReportStatus } from "@/entities/report";
import {
  ApiError,
  DocReader,
  EmptyState,
  matchesWords,
  ExportBar,
  Loading,
  assetUrl,
  canvasToBlob,
  errorText,
  formatDateTime,
  renderPages,
  readStorage,
  useConfirm,
  useDocExport,
  writeStorage,
  useI18n,
  useNotify,
  type ExportDoc,
  type MessageKey,
  type Translate,
  PagedMore,
  usePaged,
  Icon,
  PageHeader,
  SearchField,
} from "@/shared";

const VIEW_KEY = "sindaris-orders-view";
const LAYOUT_KEY = "sindaris-orders-layout";
const SAVED_KEY = "sindaris-orders-saved-views";
type Layout = "list" | "board" | "calendar";
const LAYOUTS: { key: Layout; icon: "list" | "grid" | "clock"; label: MessageKey }[] = [
  { key: "list", icon: "list", label: "hq.layout.list" },
  { key: "board", icon: "grid", label: "hq.layout.board" },
  { key: "calendar", icon: "clock", label: "hq.layout.calendar" },
];
/** Сохранённый вид: представление + фильтры + поиск (в этом браузере). */
interface SavedView {
  id: string;
  name: string;
  view: View;
  facets: Facets;
  query: string;
}
const VIEW_LABEL: Record<View, MessageKey> = {
  active: "hq.view.active", mine: "hq.view.mine", overdue: "hq.view.overdue", unassigned: "hq.view.unassigned",
  operations: "hq.view.operations", done: "hq.view.done", all: "common.all",
};

interface ReportsWorkspaceProps {
  can: Can;
  /** Текущий пользователь: свои записи журнала выполнения он может удалить. */
  userId: string;
  /** Строки рапорта загружены в черновик — открыть вкладку «Заказы». */
  onOpenConstructor: () => void;
  /** Полоса операций → раздел «Операции». */
  onOpenOperations: () => void;
}

function toDoc(report: Report, t: Translate, locale: string): ExportDoc {
  const kind = orderKindOf(report.meta.type);
  const meta = [
    kind && `${t("orderSend.kind")}: ${t(kind.label)}`,
    report.meta.region && `${t("doc.hex")}: ${report.meta.region}`,
    // бункер и завод: в поле склада лежит город (+ уточнение)
    report.meta.stockpile && `${t(report.meta.type === "bunker" || report.meta.type === "factory" ? "doc.town" : "doc.stockpile")}: ${report.meta.stockpile}`,
  ].filter(Boolean) as string[];
  return {
    title: `SINDARIS • ${report.title}`,
    header: [...meta, `${t("doc.author")}: ${report.created_by_name ?? report.created_by} • ${formatDateTime(report.created_at)}`, `${t("doc.status")}: ${t(REPORT_STATUS_LABEL[report.status])}`],
    sections: [{ rows: report.lines.map((l) => ({ name: lineName(l, locale), quantity: l.quantity, unit: unitLabel(l.unit, t), icon: assetUrl(l.icon_url) })) }],
    fileBase: `SINDARIS_report_${report.title}`.slice(0, 60),
    sheetName: t("reports.report"),
  };
}

const unitLabel = (unit: string, t: Translate) => t(unit === "crate" ? "unit.crate" : "unit.unit");

/**
 * «Заказы клана» — штаб: сводка, ближайшие операции с готовностью, представления и совмещаемые
 * фильтры, список задач (приоритет, исполнители, срок, прогресс) и карточка заказа справа.
 */
export const ReportsWorkspace: React.FC<ReportsWorkspaceProps> = ({ can, userId, onOpenConstructor, onOpenOperations }) => {
  const notify = useNotify();
  const { t, locale } = useI18n();
  const { media } = useContent();
  const texture = media("bg_report_texture");
  const { run: exportDoc, previewModal } = useDocExport(texture);
  const [view, setViewState] = React.useState<View>("active");
  const [facets, setFacets] = React.useState<Facets>(NO_FACETS);
  const [query, setQuery] = React.useState("");
  const [reports, setReports] = React.useState<Report[]>([]);
  const [ops, setOps] = React.useState<Operation[]>([]);
  const [members, setMembers] = React.useState<Assignee[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [armed, confirm] = useConfirm();
  const [layout, setLayoutState] = React.useState<Layout>("list");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [savedViews, setSavedViews] = React.useState<SavedView[]>([]);
  const [naming, setNaming] = React.useState<string | null>(null);

  React.useEffect(() => {
    const saved = readStorage<View>(VIEW_KEY, "active");
    if (VIEWS.includes(saved)) setViewState(saved);
    const l = readStorage<Layout>(LAYOUT_KEY, "list");
    if (LAYOUTS.some((x) => x.key === l)) setLayoutState(l);
    setSavedViews(readStorage<SavedView[]>(SAVED_KEY, []));
    // ссылка «Открыть на сайте» из поста бота в Discord: ?order=<id> — сразу карточка заказа
    const order = new URLSearchParams(window.location.search).get("order");
    if (order) setOpenId(order);
  }, []);
  const setLayout = (l: Layout) => {
    setLayoutState(l);
    writeStorage(LAYOUT_KEY, l);
  };
  const storeViews = (list: SavedView[]) => {
    setSavedViews(list);
    writeStorage(SAVED_KEY, list);
  };
  const saveView = () => {
    const name = (naming ?? "").trim();
    if (name) storeViews([...savedViews, { id: Math.random().toString(36).slice(2, 9), name: name.slice(0, 32), view, facets, query }]);
    setNaming(null);
  };
  const applySaved = (v: SavedView) => {
    setView(v.view);
    setFacets(v.facets);
    setQuery(v.query);
  };
  const setView = (v: View) => {
    setViewState(v);
    writeStorage(VIEW_KEY, v);
  };

  // все заказы разом: представления и фильтры считаются здесь же и совмещаются
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [all, opList, people] = await Promise.all([
        reportApi.list(),
        operationsApi.list().then((r) => r.operations).catch(() => [] as Operation[]),
        reportApi.assignees().catch(() => [] as Assignee[]),
      ]);
      setReports(all);
      setOps(opList);
      setMembers(people);
    } catch (err) {
      notify({ title: t("reports.reports"), message: errorText(err, t("reports.loadFailed")), tone: "danger" });
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [notify, t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visible = React.useMemo(() => {
    let list = applyFacets(applyView(reports, view, userId, ops), facets, ops);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((r) => matchesWords(`${r.title} ${r.tags.join(" ")} ${r.meta.region ?? ""} ${r.meta.stockpile ?? ""} ${r.assignees.map((a) => a.name).join(" ")} ${r.lines.map((l) => `${l.name} ${l.name_ru ?? ""} ${l.name_en ?? ""} ${codeSynonyms(l.item_code).join(" ")}`).join(" ")}`, q));
    return sortTasks(list);
  }, [reports, view, facets, query, userId, ops]);
  const page = usePaged(visible, 30, `${query}|${view}|${JSON.stringify(facets)}`);

  const summary = React.useMemo(() => summarize(reports), [reports]);
  const upcoming = React.useMemo(() => ops.filter((o) => o.date >= today()).slice(0, 4), [ops]);
  const regions = React.useMemo(() => [...new Set(reports.map((r) => r.meta.region).filter(Boolean) as string[])].sort(), [reports]);
  const tags = React.useMemo(() => [...new Set(reports.flatMap((r) => r.tags))].sort(), [reports]);
  const filtered = Object.values(facets).some(Boolean);
  const current = reports.find((r) => r.id === openId) ?? null;

  const replace = (report: Report) => setReports((prev) => prev.map((r) => (r.id === report.id ? report : r)));

  const act = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = (report: Report, status: ReportStatus) =>
    act(report.id, async () => {
      try {
        const r = await reportApi.setStatus(report.id, status);
        notify({ title: t("reports.report"), message: r.message, tone: "success" });
        replace(r.report);
      } catch (err) {
        notify({ title: t("reports.report"), message: errorText(err, t("reports.statusFailed")), tone: "danger" });
      }
    });

  const sendToDiscord = (report: Report) =>
    act(report.id, async () => {
      try {
        const [first] = await renderPages(toDoc(report, t, locale), texture);
        const image = first ? await canvasToBlob(first) : null;
        const r = await reportApi.sendToDiscord(report.id, image);
        replace(r.report);
        notify({ title: "DISCORD", message: r.message, tone: "success" });
      } catch (err) {
        const notConfigured = err instanceof ApiError && err.code === "discord_not_configured";
        notify({ title: "DISCORD", message: errorText(err, t("reports.discordFailed")), tone: notConfigured ? "warning" : "danger", ttl: 8000 });
      }
    });

  const remove = (report: Report) =>
    act(report.id, async () => {
      try {
        await reportApi.delete(report.id);
        setReports((prev) => prev.filter((r) => r.id !== report.id));
        setOpenId(null);
        notify({ title: t("reports.archive"), message: t("reports.deleted", { title: report.title }), tone: "warning" });
      } catch (err) {
        notify({ title: t("reports.archive"), message: errorText(err, t("reports.deleteFailed")), tone: "danger" });
      }
    });

  const facet = <K extends keyof Facets>(key: K, value: Facets[K]) => setFacets((f) => ({ ...f, [key]: value }));

  // массовые действия: по каждому выбранному заказу — тот же запрос, что и в карточке
  const pickedReports = reports.filter((r) => picked.has(r.id));
  const bulk = async (run: (r: Report) => Promise<Report | null>) => {
    let ok = 0;
    for (const r of pickedReports) {
      try {
        const next = await run(r);
        if (next) replace(next);
        ok += 1;
      } catch {
        // заказ мог стать недоступен — продолжаем с остальными
      }
    }
    notify({ title: t("hq.bulk.done"), message: t("hq.bulk.applied", { n: ok, total: pickedReports.length }), tone: ok === pickedReports.length ? "success" : "warning" });
    setPicked(new Set());
  };
  // удалить: с правом reports:delete — любой заказ, автор — свой
  const canDelete = (r: Report) => can(Scopes.REPORTS_DELETE) || r.created_by === userId;
  const bulkDelete = async () => {
    const targets = pickedReports.filter(canDelete);
    let ok = 0;
    for (const r of targets) {
      try {
        await reportApi.delete(r.id);
        ok += 1;
      } catch {
        // заказ уже удалён или нет прав — продолжаем
      }
    }
    const gone = new Set(targets.map((r) => r.id));
    setReports((prev) => prev.filter((r) => !gone.has(r.id)));
    setPicked(new Set());
    notify({ title: t("hq.bulk.done"), message: t("hq.bulk.applied", { n: ok, total: pickedReports.length }), tone: ok === pickedReports.length ? "success" : "warning" });
  };
  const bulkStatus = (status: ReportStatus) =>
    bulk(async (r) => (REPORT_TRANSITIONS[r.status].includes(status) ? (await reportApi.setStatus(r.id, status)).report : null));

  const busy = current ? busyId === current.id : false;

  return (
    <div className="tab-fade flex flex-col gap-4">
      <PageHeader
        icon="reports"
        eyebrow={t("reports.kicker")}
        title={t("reports.title")}
        lead={t("hq.lead")}
        actions={
          can(Scopes.REPORTS_CREATE) ? (
            <button type="button" className="btn btn-primary" onClick={onOpenConstructor}><Icon name="plus" size={16} />{t("reports.emptyAction")}</button>
          ) : null
        }
      >
        <div className="divider" />
        <HqSummary summary={summary} view={view} onView={setView} />
        <OperationsStrip ops={upcoming} reports={reports} active={facets.operation} onPick={(id) => facet("operation", id)} onOpenOperations={onOpenOperations} />
      </PageHeader>

      <section className="panel hq-toolbar">
        <div className="flex flex-wrap items-center gap-2">
          <div className="segmented" role="tablist" aria-label={t("hq.layout.label")}>
            {LAYOUTS.map((l) => (
              <button key={l.key} type="button" role="tab" aria-selected={layout === l.key} className={`segmented-item ${layout === l.key ? "is-active" : ""}`} onClick={() => setLayout(l.key)}>
                <Icon name={l.icon} size={14} />{t(l.label)}
              </button>
            ))}
          </div>
          <div data-guide="reports-filters" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5">
            {VIEWS.map((v) => (
              <button key={v} className={`chip shrink-0 ${view === v ? "is-active" : ""}`} onClick={() => setView(v)}>{t(VIEW_LABEL[v])}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-fg-3">{t("hq.saved.label")}</span>
          {savedViews.map((v) => (
            <span key={v.id} className="hq-saved">
              <button type="button" onClick={() => applySaved(v)}><Icon name="pin" size={12} />{v.name}</button>
              <button type="button" className="hq-person-x" aria-label={t("common.delete")} onClick={() => storeViews(savedViews.filter((x) => x.id !== v.id))}><Icon name="close" size={11} /></button>
            </span>
          ))}
          {naming === null ? (
            <button type="button" className="chip shrink-0" onClick={() => setNaming("")}><Icon name="plus" size={12} />{t("hq.saved.save")}</button>
          ) : (
            <span className="flex items-center gap-1">
              <input autoFocus className="field h-8 w-40 px-2 py-0 text-sm" value={naming} maxLength={32} placeholder={t("hq.saved.name")} onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveView(); if (e.key === "Escape") setNaming(null); }} />
              <button type="button" className="btn h-8 min-h-0 px-2.5 text-sm" onClick={saveView}><Icon name="check" size={13} /></button>
            </span>
          )}
        </div>
        <div className="hq-facets">
          <select className="field h-9 py-0 text-sm" value={facets.assignee} onChange={(e) => facet("assignee", e.target.value)} aria-label={t("hq.assignees")}>
            <option value="">{t("hq.f.anyAssignee")}</option>
            <option value="none">{t("hq.noAssignee")}</option>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
          </select>
          <select className="field h-9 py-0 text-sm" value={facets.priority} onChange={(e) => facet("priority", e.target.value as Facets["priority"])} aria-label={t("hq.priorityLabel")}>
            <option value="">{t("hq.f.anyPriority")}</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{t(`hq.priority.${p}` as MessageKey)}</option>)}
          </select>
          <select className="field h-9 py-0 text-sm" value={facets.region} onChange={(e) => facet("region", e.target.value)} aria-label={t("doc.hex")}>
            <option value="">{t("hq.f.anyRegion")}</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className="field h-9 py-0 text-sm" value={facets.operation} onChange={(e) => facet("operation", e.target.value)} aria-label={t("hq.operation")}>
            <option value="">{t("hq.f.anyOperation")}</option>
            <option value="none">{t("hq.noOperation")}</option>
            {ops.map((o) => <option key={o.id} value={o.id}>{o.title} · {o.date}</option>)}
          </select>
          {tags.length ? (
            <select className="field h-9 py-0 text-sm" value={facets.tag} onChange={(e) => facet("tag", e.target.value)} aria-label={t("hq.tags")}>
              <option value="">{t("hq.f.anyTag")}</option>
              {tags.map((x) => <option key={x} value={x}>#{x}</option>)}
            </select>
          ) : null}
          {filtered ? <button type="button" className="btn h-9 min-h-0 px-3 text-sm" onClick={() => setFacets(NO_FACETS)}><Icon name="close" size={14} />{t("hq.f.reset")}</button> : null}
          <SearchField className="hq-search" data-guide="reports-search" placeholder={t("reports.search")} value={query} onChange={setQuery} />
          <button className="btn h-9 min-h-0" onClick={() => void load()} title={t("common.sync")} aria-label={t("common.sync")}>
            <Icon name="refresh" size={15} />
          </button>
        </div>
      </section>

      {loading ? (
        <div className="panel"><Loading label={t("reports.loading")} /></div>
      ) : visible.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon="orders"
            title={query.trim() || filtered ? t("common.nothingFound") : t("reports.emptyTitle")}
            hint={query.trim() || filtered ? t("reports.emptySearchHint") : t("reports.emptyHint")}
            actions={
              query.trim() || filtered ? (
                <button type="button" className="btn" onClick={() => { setQuery(""); setFacets(NO_FACETS); }}>{t("common.clearSearch")}</button>
              ) : can(Scopes.REPORTS_CREATE) ? (
                <button type="button" className="btn btn-primary" onClick={onOpenConstructor}><Icon name="plus" size={16} />{t("reports.emptyAction")}</button>
              ) : null
            }
          />
        </div>
      ) : layout === "board" ? (
        <BoardView reports={visible} ops={ops} canStatus={can(Scopes.REPORTS_STATUS)} showClosed={view === "all" && reports.some((r) => r.status === "cancelled")} onOpen={(r) => setOpenId(r.id)} onMove={(r, st) => void setStatus(r, st)} />
      ) : layout === "calendar" ? (
        <CalendarView reports={visible} ops={ops} onOpen={(r) => setOpenId(r.id)} />
      ) : (
        <section className="panel hq-list">
          {picked.size ? (
            <div className="hq-bulk">
              <b className="text-sm">{t("hq.bulk.selected", { n: picked.size })}</b>
              {can(Scopes.REPORTS_ASSIGN) ? (
                <>
                  <select className="field h-8 w-auto py-0 text-sm" value="" onChange={(e) => e.target.value && void bulk(async (r) => reportApi.setTask(r.id, { assignees: [...new Set([...r.assignees.map((a) => a.user_id), e.target.value])] }))}>
                    <option value="">{t("hq.bulk.assign")}</option>
                    {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                  </select>
                  <select className="field h-8 w-auto py-0 text-sm" value="" onChange={(e) => e.target.value && void bulk(async (r) => reportApi.setTask(r.id, { priority: e.target.value as Report["priority"] }))}>
                    <option value="">{t("hq.bulk.priority")}</option>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{t(`hq.priority.${p}` as MessageKey)}</option>)}
                  </select>
                  <select className="field h-8 w-auto py-0 text-sm" value="" onChange={(e) => e.target.value && void bulk(async (r) => reportApi.setTask(r.id, { operation_id: e.target.value === "none" ? null : e.target.value }))}>
                    <option value="">{t("hq.bulk.operation")}</option>
                    <option value="none">{t("hq.noOperation")}</option>
                    {ops.filter((o) => o.date >= today()).map((o) => <option key={o.id} value={o.id}>{o.title} · {o.date}</option>)}
                  </select>
                </>
              ) : null}
              {can(Scopes.REPORTS_STATUS) ? (
                <select className="field h-8 w-auto py-0 text-sm" value="" onChange={(e) => e.target.value && void bulkStatus(e.target.value as ReportStatus)}>
                  <option value="">{t("hq.bulk.status")}</option>
                  {(["open", "in_progress", "done"] as ReportStatus[]).map((st) => <option key={st} value={st}>{t(REPORT_STATUS_LABEL[st])}</option>)}
                </select>
              ) : null}
              {pickedReports.some(canDelete) ? (
                <button type="button" className={`btn h-8 min-h-0 px-2.5 text-sm ${armed === "bulk-delete" ? "btn-danger" : ""}`} disabled={busyId !== null}
                  onClick={() => confirm("bulk-delete", () => void bulkDelete())}>
                  <Icon name="trash" size={13} />
                  {armed === "bulk-delete" ? t("common.confirmQ") : t("common.delete")}
                </button>
              ) : null}
              <button type="button" className="btn h-8 min-h-0 px-2.5 text-sm" onClick={() => setPicked(new Set())}><Icon name="close" size={13} />{t("hq.bulk.clear")}</button>
            </div>
          ) : null}
          <div className="hq-head" aria-hidden>
            <span />
            <span>{t("hq.col.order")}</span>
            <span>{t("hq.assignees")}</span>
            <span>{t("hq.due")}</span>
            <span>{t("hq.progress")}</span>
            <span>{t("doc.status")}</span>
          </div>
          <ul data-guide="report-card">
            {page.items.map((report) => (
              <TaskRow
                key={report.id}
                report={report}
                ops={ops}
                selected={report.id === openId}
                onOpen={() => setOpenId(report.id)}
                checked={picked.has(report.id)}
                onCheck={(on) => setPicked((prev) => { const next = new Set(prev); if (on) next.add(report.id); else next.delete(report.id); return next; })}
              />
            ))}
          </ul>
        </section>
      )}
      {visible.length > 0 && <PagedMore page={page} />}

      {current ? (
        <OrderCard
          report={current}
          ops={ops}
          members={members}
          can={can}
          userId={userId}
          busy={busy}
          onClose={() => setOpenId(null)}
          onChange={replace}
          onStatus={(r, st) => void setStatus(r, st)}
          onReload={() => void load()}
          document={
            <>
              <DocReader doc={toDoc(current, t, locale)} textureUrl={texture} expanded onExpand={() => undefined} />
              <ExportBar title={t("reports.exportTitle")} onAction={(fmt) => void exportDoc(toDoc(current, t, locale), fmt)} busy={busy} />
            </>
          }
          actions={
            <>
              <button className="btn" disabled={busy} data-guide="report-builder" title={t("reports.toBuilderHint")} onClick={() => {
                orderDraft.write(orderDraft.fromReport(current));
                notify({ title: t("builder.short"), message: t("reports.loadedToBuilder", { title: current.title }), tone: "info" });
                onOpenConstructor();
              }}>
                {t("reports.toBuilder")}
              </button>
              {can(Scopes.REPORTS_DISCORD) && (
                <button className="btn btn-discord" data-guide="report-discord" disabled={busy} onClick={() => void sendToDiscord(current)}>
                  {busy ? <span className="pulse">{t("common.sending")}</span> : <><Icon name="send" size={15} />{t("reports.toDiscord")}</>}
                </button>
              )}
              {canDelete(current) && (
                <button className={`btn ml-auto ${armed === current.id ? "btn-danger" : ""}`} disabled={busy} title={t("reports.deleteHint")} onClick={() => confirm(current.id, () => void remove(current))}>
                  <Icon name="trash" size={15} />
                  {armed === current.id ? t("common.confirmQ") : t("common.delete")}
                </button>
              )}
            </>
          }
        />
      ) : null}
      {previewModal}
    </div>
  );
};
