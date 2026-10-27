"use client";

import * as React from "react";
import { REPORT_STATUS_LABEL, reportApi, type Assignee, type ReportEvent, type ReportStatus } from "@/entities/report";
import { MentionText, MentionTextarea } from "@/features/mail/ui/Mentions";
import { Icon, cn, errorText, formatDateTime, useI18n, useNotify, type IconName, type MessageKey } from "@/shared";

const ICON: Record<string, IconName> = {
  created: "plus", status: "check", assigned: "user", unassigned: "user", take: "user", drop: "user", priority: "flag",
  due: "clock", tags: "note", operation: "map", contribution: "box", delivered: "check", comment: "message",
};

/**
 * Лента заказа: события (создан, статус, назначения, срок, вклад…) и обсуждение.
 * В комментарии «@» подсказывает роли Discord и участников — им уходит письмо в почту сайта.
 */
export const OrderActivity: React.FC<{ reportId: string; members: Assignee[]; refreshKey: string; canComment: boolean }> = ({ reportId, members, refreshKey, canComment }) => {
  const { t, locale } = useI18n();
  const notify = useNotify();
  const [events, setEvents] = React.useState<ReportEvent[] | null>(null);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    reportApi.events(reportId).then(setEvents).catch(() => setEvents([]));
  }, [reportId, refreshKey]);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const ev = await reportApi.comment(reportId, text.trim());
      setEvents((prev) => [ev, ...(prev ?? [])]);
      setText("");
    } catch (err) {
      notify({ title: t("hq.feed.failed"), message: errorText(err, t("hq.feed.failed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const describe = (e: ReportEvent): string => {
    const p = e.payload;
    const v = typeof p.value === "string" ? p.value : null;
    switch (e.kind) {
      case "created": return t("hq.feed.created");
      case "status": return t("hq.feed.status", { value: v ? t(REPORT_STATUS_LABEL[v as ReportStatus] ?? "reports.report") : "—" });
      case "assigned": return t("hq.feed.assigned", { name: p.name ?? "" });
      case "unassigned": return t("hq.feed.unassigned", { name: p.name ?? "" });
      case "take": return t("hq.feed.take");
      case "drop": return t("hq.feed.drop");
      case "priority": return t("hq.feed.priority", { value: v ? t(`hq.priority.${v}` as MessageKey) : "—" });
      case "due": return v ? t("hq.feed.due", { value: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(new Date(`${v}T00:00:00`)) }) : t("hq.feed.dueCleared");
      case "tags": return t("hq.feed.tags", { value: Array.isArray(p.value) && p.value.length ? p.value.map((x) => `#${x}`).join(" ") : "—" });
      case "operation": return v ? t("hq.feed.operation") : t("hq.feed.operationCleared");
      case "contribution": return t("hq.feed.contribution", { n: p.qty ?? 0, place: p.place ?? "—" });
      case "delivered": return t("hq.feed.delivered", { operation: p.operation ?? "" });
      default: return e.kind;
    }
  };

  return (
    <section className="hq-feed">
      <h3 className="hq-feed-title"><Icon name="message" size={15} />{t("hq.feed.title")}</h3>
      {canComment ? (
        <div className="hq-feed-compose">
          <MentionTextarea className="min-h-[4.5rem] w-full" value={text} maxLength={2000} onChange={setText} placeholder={t("hq.feed.placeholder")} people={members} onSubmit={() => void send()} />
          <button type="button" className="btn btn-primary h-9 min-h-0 self-end" disabled={busy || !text.trim()} onClick={() => void send()}>
            <Icon name="send" size={14} />
            {t("hq.feed.send")}
          </button>
        </div>
      ) : null}
      {events === null ? (
        <p className="text-sm text-fg-3">{t("common.loading")}</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-fg-3">{t("hq.feed.empty")}</p>
      ) : (
        <ol className="hq-feed-list">
          {events.map((e) => (
            <li key={e.id} className={cn("hq-feed-item", e.kind === "comment" && "is-comment", e.kind === "delivered" && "is-good")}>
              <span className="hq-feed-icon"><Icon name={ICON[e.kind] ?? "info"} size={13} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <b className="font-semibold text-fg">{e.actor_name}</b>
                  {e.kind === "comment" ? null : <span className="text-fg-2"> {describe(e)}</span>}
                  <span className="ml-2 text-xs text-fg-3">{formatDateTime(e.created_at)}</span>
                </div>
                {e.kind === "comment" && e.payload.text ? <MentionText text={e.payload.text} className="mt-1 text-sm text-fg" /> : null}
                {e.kind === "contribution" && e.payload.note ? <p className="mt-0.5 text-xs text-fg-3">{e.payload.note}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
