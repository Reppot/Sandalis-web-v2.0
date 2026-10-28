"use client";

import * as React from "react";
import { mailApi, mailChanged, type Mail } from "@/features/mail/model";
import { MentionText } from "@/features/mail/ui/Mentions";
import { EmptyState, Icon, Loading, cn, errorText, formatDateTime, useI18n, useNotify, type MessageKey } from "@/shared";

/**
 * Почта на сайте (раздел «Сайт»): упоминания ролей Discord («@роль») в операциях клана
 * и ответы разработчика на обратную связь. Открыть источник, отметить прочитанным, удалить.
 */
/** Письма «штаба» заказов — ведут в «Заказы клана». */
const ORDER_KINDS = new Set(["task_assigned", "task_due", "order_delivered", "order_comment"]);
const TIMER_KINDS = new Set(["timer_warn", "timer_expired"]);
const ROMAN = ["", "I", "II", "III"];

export const MailWorkspace: React.FC<{ onOpenOperations: () => void; onOpenFeedback: () => void; onOpenOrders: () => void; onOpenStockpiles: () => void; onOpenStats: () => void }> = ({ onOpenOperations, onOpenFeedback, onOpenOrders, onOpenStockpiles, onOpenStats }) => {
  const { t, locale } = useI18n();
  const notify = useNotify();
  const [items, setItems] = React.useState<Mail[] | null>(null);

  const load = React.useCallback(() => {
    mailApi.list().then((r) => setItems(r.items)).catch((err) => {
      setItems([]);
      notify({ title: t("mail.loadFailed"), message: errorText(err, t("mail.loadFailed")), tone: "danger" });
    });
  }, [notify, t]);
  React.useEffect(() => load(), [load]);

  const markRead = async (m: Mail) => {
    if (m.read) return;
    setItems((prev) => (prev ?? []).map((x) => (x.id === m.id ? { ...x, read: true } : x)));
    await mailApi.read(m.id).catch(() => undefined);
    mailChanged();
  };
  const readAll = async () => {
    await mailApi.readAll().catch(() => undefined);
    setItems((prev) => (prev ?? []).map((x) => ({ ...x, read: true })));
    mailChanged();
  };
  const remove = async (m: Mail) => {
    setItems((prev) => (prev ?? []).filter((x) => x.id !== m.id));
    await mailApi.remove(m.id).catch(() => undefined);
    mailChanged();
  };
  const day = (iso?: string) => (iso ? new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "long" }).format(new Date(`${iso}T00:00:00`)) : "");

  if (!items) return <div className="panel"><Loading label={t("mail.loading")} /></div>;
  const unread = items.filter((m) => !m.read).length;

  // награда очков снабжения: league:<лига> | ach:<достижение>:<ступень>
  const awardText = (key: string) => {
    const [kind, name, lvl] = key.split(":");
    if (kind === "league") return t("mail.gameLeague", { tier: t(`game.tier.${name}` as MessageKey) });
    const roman = Number(lvl) > 0 && !["first_delivery", "savior", "on_time", "closer", "op_pillar", "hot_week", "multitasker", "team_player"].includes(name) ? ` ${ROMAN[Number(lvl)]}` : "";
    return t("mail.gameAch", { name: t(`game.ach.${name}` as MessageKey) + roman });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-fg-3">{unread ? t("mail.unreadCount", { n: unread }) : t("mail.allRead")}</span>
        <button type="button" className="btn h-9 min-h-0" disabled={!unread} onClick={() => void readAll()}>
          <Icon name="check" size={15} />
          {t("mail.readAll")}
        </button>
      </div>
      {items.length === 0 ? (
        <div className="panel"><EmptyState icon="mail" title={t("mail.empty")} hint={t("mail.emptyHint")} /></div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((m) => (
            <li key={m.id} className={cn("panel mail-item", !m.read && "is-unread")} onClick={() => void markRead(m)}>
              <span className="mail-icon"><Icon name="mail" size={16} /></span>
              {ORDER_KINDS.has(m.kind) ? (
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-fg">
                    {m.kind === "task_due"
                      ? t("mail.taskDue", { title: m.payload.title ?? "", date: day(m.payload.due_date ?? undefined) })
                      : m.kind === "order_delivered"
                        ? t("mail.orderDelivered", { name: m.sender_name, title: m.payload.title ?? "", operation: m.payload.operation ?? "" })
                        : m.kind === "order_comment"
                          ? t("mail.orderComment", { name: m.sender_name, title: m.payload.title ?? "" })
                          : t("mail.taskAssigned", { name: m.sender_name, title: m.payload.title ?? "" })}
                  </div>
                  <div className="mt-0.5 text-xs text-fg-3">{m.kind === "task_assigned" && m.payload.due_date ? `${t("hq.due")}: ${day(m.payload.due_date)} · ` : ""}{formatDateTime(m.created_at)}</div>
                  {m.kind === "order_comment" && m.payload.text ? <MentionText text={m.payload.text} className="mt-2 text-sm text-fg-2" /> : null}
                </div>
              ) : m.kind === "game_award" ? (
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-fg">{awardText(m.payload.key ?? "")}</div>
                  <div className="mt-0.5 text-xs text-fg-3">{formatDateTime(m.created_at)}</div>
                </div>
              ) : TIMER_KINDS.has(m.kind) ? (
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm", m.kind === "timer_expired" ? "font-semibold text-danger" : "text-fg")}>
                    {t(m.kind === "timer_expired" ? "mail.timerExpired" : "mail.timerWarn", {
                      title: m.payload.title ?? "",
                      time: m.payload.ends_at ? formatDateTime(m.payload.ends_at) : "",
                    })}
                  </div>
                  <div className="mt-0.5 text-xs text-fg-3">{m.payload.stockpile ? `${m.payload.stockpile} · ` : ""}{formatDateTime(m.created_at)}</div>
                </div>
              ) : m.kind === "feedback_reply" ? (
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-fg">{t("mail.feedbackReply", { name: m.sender_name })}</div>
                  <div className="mt-0.5 text-xs text-fg-3">{formatDateTime(m.created_at)}</div>
                  {m.payload.message ? <blockquote className="mail-quote">{m.payload.message}</blockquote> : null}
                  <p className="mt-2 whitespace-pre-line text-sm text-fg">{m.payload.reply}</p>
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-fg">
                    {t("mail.operationMention", { name: m.sender_name, roles: (m.payload.roles ?? []).map((r) => `@${r}`).join(", "), title: m.payload.title ?? "" })}
                  </div>
                  <div className="mt-0.5 text-xs text-fg-3">{day(m.payload.date)} · {formatDateTime(m.created_at)}</div>
                  {m.payload.note ? <MentionText text={m.payload.note} className="mt-2 text-sm text-fg-2" /> : null}
                </div>
              )}
              <span className="flex shrink-0 flex-col items-end gap-1.5">
                <button type="button" className="btn h-8 min-h-0 px-2.5 text-xs" onClick={(e) => { e.stopPropagation(); void markRead(m); (m.kind === "feedback_reply" ? onOpenFeedback : ORDER_KINDS.has(m.kind) ? onOpenOrders : TIMER_KINDS.has(m.kind) ? onOpenStockpiles : m.kind === "game_award" ? onOpenStats : onOpenOperations)(); }}>
                  <Icon name="external" size={14} />
                  {m.kind === "feedback_reply" ? t("mail.openFeedback") : ORDER_KINDS.has(m.kind) ? t("mail.openOrders") : TIMER_KINDS.has(m.kind) ? t("mail.openStockpiles") : m.kind === "game_award" ? t("mail.openStats") : t("mail.openOperation")}
                </button>
                <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); void remove(m); }} aria-label={t("common.delete")} title={t("common.delete")}><Icon name="trash" size={15} /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
