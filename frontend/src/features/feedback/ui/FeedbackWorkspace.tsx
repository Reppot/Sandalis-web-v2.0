"use client";

import * as React from "react";
import { EmptyState, Icon, Loading, PageHeader, SearchField, cn, errorText, formatDateTime, matchesWords, useConfirm, useI18n, useNotify, type IconName, type MessageKey } from "@/shared";
import { feedbackApi, type Feedback, type FeedbackCategory, type FeedbackOverview, type FeedbackStatus } from "@/features/feedback/model/api";

const CATEGORIES: { key: FeedbackCategory; icon: IconName; label: MessageKey; hint: MessageKey }[] = [
  { key: "idea", icon: "sparkles", label: "feedback.cat.idea", hint: "feedback.cat.ideaHint" },
  { key: "bug", icon: "warning", label: "feedback.cat.bug", hint: "feedback.cat.bugHint" },
  { key: "other", icon: "message", label: "feedback.cat.other", hint: "feedback.cat.otherHint" },
];
const STATUS_LABEL: Record<FeedbackStatus, MessageKey> = { new: "feedback.status.new", read: "feedback.status.read", done: "feedback.status.done" };
const MAX = 4000;
const categoryOf = (key: FeedbackCategory) => CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[2];

/**
 * «Обратная связь»: любой вошедший через Discord участник пишет идею, ошибку или вопрос —
 * сообщение уходит владельцу сайта вместе с ником и кланом. Владелец видит всё и ставит статус.
 */
export const FeedbackWorkspace: React.FC<{ displayName: string | null }> = ({ displayName }) => {
  const { t } = useI18n();
  const notify = useNotify();
  const [data, setData] = React.useState<FeedbackOverview | null>(null);
  const [category, setCategory] = React.useState<FeedbackCategory>("idea");
  const [message, setMessage] = React.useState("");
  const [page, setPage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    feedbackApi
      .overview()
      .then(setData)
      .catch((err) => notify({ title: t("feedback.title"), message: errorText(err, t("feedback.loadFailed")), tone: "danger" }));
  }, [notify, t]);
  React.useEffect(load, [load]);

  const send = async () => {
    if (message.trim().length < 3) return;
    setBusy(true);
    try {
      await feedbackApi.send({ category, message: message.trim(), page: page.trim() || null });
      setMessage("");
      setPage("");
      notify({ title: t("feedback.title"), message: t("feedback.sent"), tone: "success" });
      load();
    } catch (err) {
      notify({ title: t("feedback.title"), message: errorText(err, t("feedback.sendFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="panel"><Loading label={t("feedback.loading")} /></div>;

  return (
    <div className="tab-fade flex flex-col gap-4">
      <PageHeader
        icon="feedback"
        eyebrow={t("feedback.kicker")}
        title={t("feedback.title")}
        lead={t("feedback.hint")}
        actions={data.is_admin ? <span className="feedback-unread">{t("feedback.unread", { n: data.unread })}</span> : null}
      />

      {data.is_admin ? <Inbox items={data.inbox} onChanged={load} /> : null}

      <section data-guide="feedback-form" className="panel p-5">
        <div className="panel-title mb-4">{t("feedback.write")}</div>
        {data.can_write ? (
          <div className="grid gap-3">
            <div className="feedback-cats" role="radiogroup" aria-label={t("feedback.category")}>
              {CATEGORIES.map((c) => (
                <button key={c.key} type="button" role="radio" aria-checked={category === c.key} className={cn("feedback-cat", category === c.key && "is-active")} onClick={() => setCategory(c.key)}>
                  <span className="feedback-cat-icon" aria-hidden><Icon name={c.icon} size={18} /></span>
                  <span className="min-w-0">
                    <b>{t(c.label)}</b>
                    <small>{t(c.hint)}</small>
                  </span>
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="field-label">{t("feedback.message")}</span>
              <textarea className="field min-h-[10rem] resize-y" maxLength={MAX} value={message} placeholder={t("feedback.placeholder")} onChange={(e) => setMessage(e.target.value)} />
              <span className="self-end text-xs text-fg-3 tabular">{message.length} / {MAX}</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="field-label">{t("feedback.page")}</span>
              <input className="field h-10" maxLength={120} value={page} placeholder={t("feedback.pagePlaceholder")} onChange={(e) => setPage(e.target.value)} />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs text-fg-3"><Icon name="user" size={14} />{t("feedback.signedAs", { name: displayName ?? "—" })}</span>
              <button type="button" className="btn btn-primary btn-lg" data-guide="feedback-send" disabled={busy || message.trim().length < 3} onClick={() => void send()}>
                {busy ? t("common.sending") : <><Icon name="send" size={16} />{t("feedback.send")}</>}
              </button>
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-[0.9rem] text-fg-2"><Icon name="lock" size={16} />{t("feedback.loginRequired")}</p>
        )}
      </section>

      {data.mine.length ? (
        <section className="panel p-5">
          <div className="panel-title mb-4">{t("feedback.mine", { n: data.mine.length })}</div>
          <ul className="flex flex-col gap-2">
            {data.mine.map((f) => (
              <FeedbackItem key={f.id} item={f} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
};

/** Входящие владельца сайта: ник, клан, раздел, текст; статус и удаление. */
const Inbox: React.FC<{ items: Feedback[]; onChanged: () => void }> = ({ items, onChanged }) => {
  const { t } = useI18n();
  const notify = useNotify();
  const [filter, setFilter] = React.useState<FeedbackStatus | "all">("new");
  const [query, setQuery] = React.useState("");
  const [armed, confirm] = useConfirm();

  const shown = items.filter((f) => (filter === "all" || f.status === filter) && (!query.trim() || matchesWords(`${f.user_name} ${f.clan_name ?? ""} ${f.page ?? ""} ${f.message}`, query)));
  const count = (s: FeedbackStatus) => items.filter((f) => f.status === s).length;

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      onChanged();
    } catch (err) {
      notify({ title: t("feedback.title"), message: errorText(err, t("feedback.sendFailed")), tone: "danger" });
    }
  };

  return (
    <section data-guide="feedback-inbox" className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="panel-title">{t("feedback.inbox")}</div>
        <SearchField className="w-full max-w-xs" value={query} placeholder={t("feedback.search")} onChange={setQuery} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(["new", "read", "done", "all"] as const).map((s) => (
          <button key={s} type="button" className={cn("chip", filter === s && "is-active")} onClick={() => setFilter(s)}>
            {s === "all" ? t("common.all") : t(STATUS_LABEL[s])}
            <span className="opacity-60">{s === "all" ? items.length : count(s)}</span>
          </button>
        ))}
      </div>
      <div className="divider" />
      {shown.length ? (
        <ul className="flex flex-col gap-2">
          {shown.map((f) => (
            <FeedbackItem key={f.id} item={f} showAuthor footer={<ReplyBox item={f} onSent={onChanged} />}>
              {f.status !== "read" ? <button type="button" className="btn h-8 min-h-0 px-3 text-[0.8rem]" onClick={() => void act(() => feedbackApi.setStatus(f.id, "read"))}><Icon name="eye" size={14} />{t("feedback.markRead")}</button> : null}
              {f.status !== "done" ? <button type="button" className="btn btn-primary h-8 min-h-0 px-3 text-[0.8rem]" onClick={() => void act(() => feedbackApi.setStatus(f.id, "done"))}><Icon name="check" size={14} />{t("feedback.markDone")}</button> : null}
              <button type="button" className={cn(armed === f.id ? "btn btn-danger h-8 min-h-0 px-3 text-[0.8rem]" : "icon-btn h-8 w-8")} aria-label={t("common.delete")} onClick={() => confirm(f.id, () => void act(() => feedbackApi.remove(f.id)))}>
                {armed === f.id ? t("common.confirmQ") : <Icon name="trash" size={15} />}
              </button>
            </FeedbackItem>
          ))}
        </ul>
      ) : (
        <EmptyState icon="feedback" title={t("feedback.inboxEmpty")} />
      )}
    </section>
  );
};

/** Ответ автору (владелец сайта): сохраняется у сообщения и приходит автору в почту. */
const ReplyBox: React.FC<{ item: Feedback; onSent: () => void }> = ({ item, onSent }) => {
  const { t } = useI18n();
  const notify = useNotify();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  if (!open) {
    return (
      <button type="button" className="btn mt-2 h-8 min-h-0 self-start px-3 text-[0.8rem]" onClick={() => { setText(item.reply ?? ""); setOpen(true); }}>
        <Icon name="send" size={14} />
        {item.reply ? t("feedback.replyAgain") : t("feedback.reply")}
      </button>
    );
  }
  const send = async () => {
    setBusy(true);
    try {
      await feedbackApi.reply(item.id, text.trim());
      notify({ title: t("feedback.replySent"), message: item.user_name, tone: "success" });
      setOpen(false);
      onSent();
    } catch (err) {
      notify({ title: t("feedback.replyFailed"), message: errorText(err, t("feedback.replyFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 flex flex-col gap-2">
      <textarea className="field min-h-[5rem]" value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} placeholder={t("feedback.replyPlaceholder")} />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn h-8 min-h-0 px-3 text-[0.8rem]" onClick={() => setOpen(false)}>{t("common.cancel")}</button>
        <button type="button" className="btn btn-primary h-8 min-h-0 px-3 text-[0.8rem]" disabled={busy || !text.trim()} onClick={() => void send()}>
          <Icon name="send" size={14} />
          {t("feedback.replySend")}
        </button>
      </div>
    </div>
  );
};

const FeedbackItem: React.FC<React.PropsWithChildren<{ item: Feedback; showAuthor?: boolean; footer?: React.ReactNode }>> = ({ item, showAuthor, footer, children }) => {
  const { t } = useI18n();
  const cat = categoryOf(item.category);
  return (
    <li className={cn("feedback-item", `is-${item.status}`)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="feedback-badge"><Icon name={cat.icon} size={12} />{t(cat.label)}</span>
        {showAuthor ? (
          <>
            <b className="feedback-author">{item.user_name}</b>
            {item.clan_name ? <span className="text-xs text-fg-3">{item.clan_name}</span> : null}
          </>
        ) : null}
        <span className="text-xs text-fg-3">{formatDateTime(item.created_at)}</span>
        {item.page ? <span className="badge badge-neutral">{item.page}</span> : null}
        <span className={cn("feedback-status", `is-${item.status}`)}>{t(STATUS_LABEL[item.status])}</span>
        {children ? <span className="ml-auto flex flex-wrap gap-1">{children}</span> : null}
      </div>
      <p className="feedback-text">{item.message}</p>
      {item.reply ? (
        <div className="feedback-reply">
          <span className="feedback-reply-head"><Icon name="send" size={12} />{t("feedback.replyFrom")}{item.replied_at ? ` · ${formatDateTime(item.replied_at)}` : ""}</span>
          <p className="whitespace-pre-line">{item.reply}</p>
        </div>
      ) : null}
      {showAuthor ? <span className="text-xs text-fg-3">ID {item.user_id}</span> : null}
      {footer}
    </li>
  );
};
