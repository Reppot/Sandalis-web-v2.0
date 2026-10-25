"use client";

import * as React from "react";
import { EmptyState, Loading, UiGlyph, cn, errorText, formatDateTime, matchesWords, useConfirm, useI18n, useNotify, type MessageKey } from "@/shared";
import { DonateBlock } from "@/features/feedback/ui/DonateBlock";
import { feedbackApi, type Feedback, type FeedbackCategory, type FeedbackOverview, type FeedbackStatus } from "@/features/feedback/model/api";

const CATEGORIES: { key: FeedbackCategory; icon: string; label: MessageKey; hint: MessageKey }[] = [
  { key: "idea", icon: "💡", label: "feedback.cat.idea", hint: "feedback.cat.ideaHint" },
  { key: "bug", icon: "🐞", label: "feedback.cat.bug", hint: "feedback.cat.bugHint" },
  { key: "other", icon: "💬", label: "feedback.cat.other", hint: "feedback.cat.otherHint" },
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

  if (!data) return <div className="panel rounded-md"><Loading label={t("feedback.loading")} /></div>;

  return (
    <div className="tab-fade flex flex-col gap-3">
      <section className="panel panel-corners rounded-md p-4">
        <div className="flex flex-wrap items-start gap-3">
          <UiGlyph icon="feedback" size={44} />
          <div className="min-w-0 flex-1">
            <div className="hud-label text-muted">{t("feedback.kicker")}</div>
            <h1 className="panel-title mt-1 text-[1rem] md:text-[1.25rem]">{t("feedback.title")}</h1>
            <p className="mt-1 max-w-3xl text-[0.85rem] text-white/75">{t("feedback.hint")}</p>
          </div>
          {data.is_admin ? <span className="feedback-unread">{t("feedback.unread", { n: data.unread })}</span> : null}
        </div>
      </section>

      {data.is_admin ? <Inbox items={data.inbox} onChanged={load} /> : null}

      <section data-guide="feedback-form" className="panel panel-corners rounded-md p-4">
        <div className="panel-title">✍ {t("feedback.write")}</div>
        <div className="cabinet-rule" />
        {data.can_write ? (
          <div className="grid gap-3">
            <div className="feedback-cats" role="radiogroup" aria-label={t("feedback.category")}>
              {CATEGORIES.map((c) => (
                <button key={c.key} type="button" role="radio" aria-checked={category === c.key} className={cn("feedback-cat", category === c.key && "is-active")} onClick={() => setCategory(c.key)}>
                  <span className="feedback-cat-icon" aria-hidden>{c.icon}</span>
                  <span className="min-w-0">
                    <b>{t(c.label)}</b>
                    <small>{t(c.hint)}</small>
                  </span>
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1">
              <span className="hud-label text-muted">{t("feedback.message")}</span>
              <textarea className="field min-h-[9rem] resize-y text-[0.9rem]" maxLength={MAX} value={message} placeholder={t("feedback.placeholder")} onChange={(e) => setMessage(e.target.value)} />
              <span className="hud-label self-end text-muted">{message.length} / {MAX}</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="hud-label text-muted">{t("feedback.page")}</span>
              <input className="field h-10" maxLength={120} value={page} placeholder={t("feedback.pagePlaceholder")} onChange={(e) => setPage(e.target.value)} />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="hud-label text-muted">👤 {t("feedback.signedAs", { name: displayName ?? "—" })}</span>
              <button type="button" className="btn btn-primary" data-guide="feedback-send" disabled={busy || message.trim().length < 3} onClick={() => void send()}>
                {busy ? t("common.sending") : `📨 ${t("feedback.send")}`}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[0.9rem] text-white/80">🔒 {t("feedback.loginRequired")}</p>
        )}
      </section>

      <DonateBlock />

      {data.mine.length ? (
        <section className="panel panel-corners rounded-md p-4">
          <div className="panel-title">🗂 {t("feedback.mine", { n: data.mine.length })}</div>
          <div className="cabinet-rule" />
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
    <section data-guide="feedback-inbox" className="panel panel-corners rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="panel-title">📥 {t("feedback.inbox")}</div>
        <input className="field h-9 w-full max-w-xs py-1 text-xs" value={query} placeholder={t("feedback.search")} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(["new", "read", "done", "all"] as const).map((s) => (
          <button key={s} type="button" className={cn("chip h-9 px-4", filter === s && "is-active")} onClick={() => setFilter(s)}>
            {s === "all" ? `${t("common.all")} • ${items.length}` : `${t(STATUS_LABEL[s])} • ${count(s)}`}
          </button>
        ))}
      </div>
      <div className="cabinet-rule" />
      {shown.length ? (
        <ul className="flex flex-col gap-2">
          {shown.map((f) => (
            <FeedbackItem key={f.id} item={f} showAuthor>
              {f.status !== "read" ? <button type="button" className="btn px-2 py-1 text-[0.65rem]" onClick={() => void act(() => feedbackApi.setStatus(f.id, "read"))}>👁 {t("feedback.markRead")}</button> : null}
              {f.status !== "done" ? <button type="button" className="btn btn-primary px-2 py-1 text-[0.65rem]" onClick={() => void act(() => feedbackApi.setStatus(f.id, "done"))}>✔ {t("feedback.markDone")}</button> : null}
              <button type="button" className={cn("btn btn-danger px-2 py-1 text-[0.65rem]", armed === f.id && "btn-active")} onClick={() => confirm(f.id, () => void act(() => feedbackApi.remove(f.id)))}>
                {armed === f.id ? t("common.confirmQ") : "🗑"}
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

const FeedbackItem: React.FC<React.PropsWithChildren<{ item: Feedback; showAuthor?: boolean }>> = ({ item, showAuthor, children }) => {
  const { t } = useI18n();
  const cat = categoryOf(item.category);
  return (
    <li className={cn("feedback-item", `is-${item.status}`)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="feedback-badge">{cat.icon} {t(cat.label)}</span>
        {showAuthor ? (
          <>
            <b className="feedback-author">{item.user_name}</b>
            {item.clan_name ? <span className="hud-label text-muted">🛡 {item.clan_name}</span> : null}
          </>
        ) : null}
        <span className="hud-label text-muted">{formatDateTime(item.created_at)}</span>
        {item.page ? <span className="hud-label text-accent">📍 {item.page}</span> : null}
        <span className={cn("feedback-status", `is-${item.status}`)}>{t(STATUS_LABEL[item.status])}</span>
        {children ? <span className="ml-auto flex flex-wrap gap-1">{children}</span> : null}
      </div>
      <p className="feedback-text">{item.message}</p>
      {showAuthor ? <span className="hud-label text-muted">ID {item.user_id}</span> : null}
    </li>
  );
};
