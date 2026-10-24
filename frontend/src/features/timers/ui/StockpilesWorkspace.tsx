"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { Scopes, type Can } from "@/entities/session";
import { stockpileApi, type Stockpile, type StockpileKind } from "@/entities/stockpile";
import { RegionTownFields } from "@/entities/world";
import { catalogApi } from "@/entities/item";
import {
  EmptyState,
  Field,
  Loading,
  Modal,
  PagedMore,
  UiGlyph,
  copyText,
  errorText,
  formatCountdown,
  formatDateTime,
  secondsLeft,
  severityOf,
  timeUnits,
  useI18n,
  useNotify,
  usePaged,
  type MessageKey,
} from "@/shared";
import { useClock, useRiskSummary, useTerminal, type MonitoredTimer } from "@/features/timers/model";
import { RegisterTimerModal, TimerManagerModal } from "@/features/timers/ui/TimerModals";

const BAR = { critical: "#ff5555", warning: "#ff9900", safe: "#a3e635" } as const;
const KINDS: { key: StockpileKind; label: MessageKey; icon: string }[] = [
  { key: "seaport", label: "stock.kind.seaport", icon: "⚓" },
  { key: "depot", label: "stock.kind.depot", icon: "📦" },
  { key: "other", label: "stock.kind.other", icon: "🏚" },
];
const kindOf = (k: StockpileKind | null | undefined) => KINDS.find((x) => x.key === k);

/** Склад клана и его таймер — одна запись. Таймер без склада (старые записи) — запись без описания. */
interface Row {
  key: string;
  stockpile: Stockpile | null;
  timer: MonitoredTimer | null;
}

/**
 * «Склады клана»: одна карточка на склад — описание (гекс, город, тип, пароль, содержимое)
 * и его таймер удержания (обратный отсчёт, управление). Данные — общий опрос TerminalProvider.
 */
export const StockpilesWorkspace: React.FC<{ can: Can }> = ({ can }) => {
  const { t } = useI18n();
  const { timers, stockpiles, loading, refresh, connection } = useTerminal();
  const risk = useRiskSummary();
  const now = useClock();
  const [query, setQuery] = React.useState("");
  const [managedId, setManagedId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Stockpile | "new" | null>(null);
  const [monitor, setMonitor] = React.useState<{ region: string; location: string } | null>(null);
  const [shown, setShown] = React.useState<Set<string>>(new Set());
  const [contents, setContents] = React.useState<Stockpile | null>(null);

  const rows = React.useMemo<Row[]>(() => {
    // у склада — самый актуальный таймер: сначала незавершённый с ближайшим сроком
    const byStockpile = new Map<string, MonitoredTimer>();
    for (const tm of timers) {
      if (!tm.stockpile_id) continue;
      const prev = byStockpile.get(tm.stockpile_id);
      const better = !prev || (prev.completed_at && !tm.completed_at) || (!prev.completed_at === !tm.completed_at && new Date(tm.ends_at) < new Date(prev.ends_at));
      if (better) byStockpile.set(tm.stockpile_id, tm);
    }
    const all: Row[] = [
      ...stockpiles.map((s) => ({ key: s.id, stockpile: s, timer: byStockpile.get(s.id) ?? null })),
      ...timers.filter((tm) => !tm.stockpile_id).map((tm) => ({ key: `t-${tm.id}`, stockpile: null, timer: tm })),
    ];
    const active = (r: Row) => Boolean(r.timer && !r.timer.completed_at);
    return all.sort((a, b) =>
      active(a) !== active(b)
        ? active(a) ? -1 : 1
        : active(a)
          ? new Date(a.timer!.ends_at).getTime() - new Date(b.timer!.ends_at).getTime()
          : (a.stockpile?.name ?? a.timer?.title ?? "").localeCompare(b.stockpile?.name ?? b.timer?.title ?? ""),
    );
  }, [stockpiles, timers]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.stockpile?.name ?? r.timer?.title ?? ""} ${r.stockpile?.region ?? ""} ${r.stockpile?.town ?? ""}`.toLowerCase().includes(q));
  }, [rows, query]);
  const page = usePaged(visible, 30, query);
  const managed = managedId ? timers.find((tm) => tm.id === managedId) ?? null : null;

  return (
    <div className="flex flex-col gap-2.5 md:gap-3">
      <section className="panel panel-corners rounded-md px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <UiGlyph icon="stockpile" size={30} />
            <h2 className="panel-title">{t("clan.stockpilesTitle")} • {rows.length}</h2>
          </div>
          <Stat guide="timers-stats" label={`🚨 ${t("timers.critical")}`} value={risk.critical} color="var(--danger)" />
          <Stat label={`⚠️ ${t("timers.warning")}`} value={risk.warning} color="var(--warn)" />
          <Stat label={`✅ ${t("timers.safe")}`} value={risk.safe} color="var(--tk-safe)" />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input className="field w-44 py-1.5 text-xs" data-guide="timers-search" placeholder={t("timers.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="btn" onClick={() => void refresh()} title={t("common.syncHint")}>⟳ <span className="hidden sm:inline">{t("common.sync")}</span></button>
            {can(Scopes.STOCKPILES_CREATE) ? (
              <button className="btn btn-primary" data-guide="stockpile-new" onClick={() => setEditing("new")}>＋ {t("stock.newClan")}</button>
            ) : null}
          </div>
        </div>
        <p className="mt-1.5 text-[0.78rem] text-white/60">{t("clan.stockpilesHint")}</p>
      </section>

      {loading ? (
        <div className="panel rounded-md"><Loading label={t("timers.loading")} /></div>
      ) : visible.length === 0 ? (
        <div className="panel panel-corners rounded-md">
          <EmptyState icon="stockpile" title={rows.length ? t("common.nothingFound") : t("clan.noStockpiles")}>
            {connection === "offline" && <div className="hud-label text-danger">{t("common.noDb")}</div>}
          </EmptyState>
        </div>
      ) : (
        <ul data-guide="clan-stockpiles" className="flex flex-col gap-2.5">
          {page.items.map((row) => (
            <StockpileCard
              key={row.key}
              row={row}
              now={now}
              can={can}
              revealed={shown.has(row.key)}
              onReveal={() => setShown((prev) => { const next = new Set(prev); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); return next; })}
              onManage={() => row.timer && setManagedId(row.timer.id)}
              onEdit={() => row.stockpile && setEditing(row.stockpile)}
              onContents={() => row.stockpile && setContents(row.stockpile)}
              onMonitor={() => row.stockpile && setMonitor({ region: row.stockpile.region, location: row.stockpile.name })}
            />
          ))}
        </ul>
      )}
      {visible.length > 0 && <PagedMore page={page} />}

      {managed && <TimerManagerModal timer={managed} can={can} onClose={() => setManagedId(null)} />}
      <RegisterTimerModal open={Boolean(monitor)} preset={monitor} onClose={() => setMonitor(null)} />
      <StockpileContentsModal target={contents} onClose={() => setContents(null)} onSaved={() => void refresh()} />
      <StockpileDetailsModal target={editing} onClose={() => setEditing(null)} onSaved={() => void refresh()} />
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; color: string; guide?: string }> = ({ label, value, color, guide }) => {
  const { t } = useI18n();
  return (
    <div data-guide={guide} className="flex items-center gap-2 font-mono text-[0.72rem] font-bold tracking-wide" style={{ color }}>
      <span>{label}:</span>
      <span className="rounded border px-1.5 py-0.5 tabular-nums" style={{ borderColor: color, background: "rgba(0,0,0,0.3)" }}>{t("timers.bases", { n: value })}</span>
    </div>
  );
};

const StockpileCard: React.FC<{
  row: Row;
  now: number;
  can: Can;
  revealed: boolean;
  onReveal: () => void;
  onManage: () => void;
  onEdit: () => void;
  onContents: () => void;
  onMonitor: () => void;
}> = ({ row, now, can, revealed, onReveal, onManage, onEdit, onContents, onMonitor }) => {
  const { t } = useI18n();
  const notify = useNotify();
  const { media } = useContent();
  const { stockpile: s, timer } = row;
  const kind = kindOf(s?.kind);
  const active = Boolean(timer && !timer.completed_at);
  const ts = timer ? secondsLeft(timer.ends_at, now || Date.now()) : 0;
  const sev = !active ? "safe" : severityOf(ts);
  const pct = timer ? Math.max(0, Math.min(100, (ts / Math.max(1, timer.duration_seconds)) * 100)) : 0;
  const bg = media("bg_card");

  return (
    <li
      className={`timer-card stockpile-card sev-${active ? sev : "none"}`}
      style={bg ? { backgroundImage: `linear-gradient(90deg, var(--card-bg), var(--card-bg)), url(${bg})` } : undefined}
    >
      <div className="stockpile-card-grid">
        <span className="clan-stockpile-kind" title={kind ? t(kind.label) : undefined}>{kind?.icon ?? "🏬"}</span>

        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[0.98rem] font-bold text-white">
            <span className="truncate">{s?.name ?? timer?.title}</span>
          </div>
          <div className="clan-stockpile-meta">
            🗺 {s?.region ?? "—"}{s?.town ? ` • ${s.town}` : ""}{kind ? ` • ${t(kind.label)}` : ""}
          </div>
          <div className="stockpile-card-info">
            <span className="flex items-center gap-1">
              <span className="hud-label text-muted">🔑 {t("stock.password")}:</span>
              {s?.accessCode ? (
                <>
                  <code className="clan-stockpile-code">{revealed ? s.accessCode : "•".repeat(Math.min(8, s.accessCode.length))}</code>
                  <button type="button" className="btn px-1.5 py-0.5" title={revealed ? t("stock.hide") : t("stock.show")} onClick={onReveal}>{revealed ? "🙈" : "👁"}</button>
                  <button type="button" className="btn px-1.5 py-0.5" title={t("common.copy")}
                    onClick={() => void copyText(s.accessCode!).then((ok) => ok && notify({ title: s.name, message: t("stock.passwordCopied"), tone: "success" }))}>⧉</button>
                </>
              ) : (
                <span className="hud-label text-muted">—</span>
              )}
            </span>
            {s ? (
              <span className="hud-label text-muted">📦 {t("clan.stockpileLines", { n: s.itemsCount })}{s.lastSyncAt ? ` • ${formatDateTime(new Date(s.lastSyncAt))}` : ""}</span>
            ) : null}
          </div>
        </div>

        <div className="stockpile-card-timer">
          {timer ? (
            <>
              <div className="hud-label text-white/60">
                {timer.completed_at ? t("timers.completed") : ts > 0 ? t(sev === "critical" ? "timers.sevCritical" : sev === "warning" ? "timers.sevWarning" : "timers.sevSafe") : t("timers.timerExpired")}
              </div>
              <div data-guide="timer-left" className={`timer-value ${sev === "critical" && ts > 0 && active ? "pulse" : ""}`}>
                {!active ? "—" : ts > 0 ? formatCountdown(ts, timeUnits(t)) : "00:00:00"}
              </div>
              <div className="progress-track mt-1.5 w-full">
                <div className="progress-bar" style={{ width: `${active ? pct : 100}%`, background: BAR[sev], boxShadow: `0 0 10px ${BAR[sev]}` }} />
              </div>
            </>
          ) : (
            <div className="hud-label text-muted">⏱ {t("clan.noTimer")}</div>
          )}
        </div>

        <div className="stockpile-card-actions">
          {timer ? (
            <button className="btn h-[34px] min-w-[110px]" data-guide="timer-manage" onClick={onManage}>{t("timers.manage")}</button>
          ) : s && can(Scopes.TIMERS_CREATE) ? (
            <button className="btn btn-primary h-[34px]" onClick={onMonitor}>⏱ {t("clan.startTimer")}</button>
          ) : null}
          {s && can(Scopes.STOCKPILES_ITEMS) ? (
            <button className="btn h-[34px]" data-guide="stockpile-contents" onClick={onContents}>📥 {t("stock.updateContents")}</button>
          ) : null}
          {s && can(Scopes.STOCKPILES_EDIT) ? (
            <button className="btn h-[34px] px-2.5" title={t("clan.editStockpile")} onClick={onEdit}>✎</button>
          ) : null}
        </div>
      </div>
    </li>
  );
};

/** «Обновить содержимое»: вставленный JSON (или текст) сканера заменяет содержимое склада. */
const StockpileContentsModal: React.FC<{ target: Stockpile | null; onClose: () => void; onSaved: () => void }> = ({ target, onClose, onSaved }) => {
  const { t } = useI18n();
  const notify = useNotify();
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (target) setText("");
  }, [target]);

  const submit = async () => {
    if (!target || !text.trim()) return;
    setBusy(true);
    try {
      const parsed = await catalogApi.parse(text);
      const items = parsed.lines.filter((l) => l.item && l.count > 0).map((l) => ({ item_code: l.item!.code, quantity: l.count }));
      if (!items.length) {
        notify({ title: t("import.formatError"), message: t("import.formatHelp"), tone: "danger", ttl: 8000 });
        return;
      }
      const source = text.trim().startsWith("{") || text.trim().startsWith("[") ? "json" : "txt";
      const saved = await stockpileApi.replaceContents(target.id, items, source);
      notify({ title: t("stock.synced"), message: saved.message, tone: "success" });
      if (parsed.unknown.length) {
        notify({ title: t("import.notInCatalog"), message: parsed.unknown.slice(0, 6).join(" • "), tone: "warning", ttl: 9000 });
      }
      onSaved();
      onClose();
    } catch (err) {
      notify({ title: t("stock.updateContents"), message: errorText(err, t("stock.notSaved")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(target)} onClose={onClose} title={`${t("stock.updateContents")} • ${target?.name ?? ""}`} icon="stockpile" widthClass="max-w-2xl">
      <div className="grid gap-3">
        <p className="text-[0.85rem] text-white/75">{t("stock.updateContentsHint")}</p>
        <textarea className="field field-mono min-h-[16rem] text-[0.75rem]" autoFocus spellCheck={false} value={text} placeholder='{ "items": [ ... ] }' onChange={(e) => setText(e.target.value)} />
        <p className="hud-label" style={{ color: "var(--warn)" }}>⚠ {t("stock.updateContentsWarn")}</p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void submit()}>{busy ? t("common.sending") : `📥 ${t("stock.updateContents")}`}</button>
        </div>
      </div>
    </Modal>
  );
};

/** Описание склада: гекс и город (подсказки War API), название, тип постройки, пароль. */
const StockpileDetailsModal: React.FC<{ target: Stockpile | "new" | null; onClose: () => void; onSaved: () => void }> = ({ target, onClose, onSaved }) => {
  const { t } = useI18n();
  const notify = useNotify();
  const { list } = useContent();
  const [name, setName] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [town, setTown] = React.useState("");
  const [kind, setKind] = React.useState<StockpileKind | "">("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!target) return;
    const s = target === "new" ? null : target;
    setName(s?.name ?? "");
    setRegion(s?.region ?? "");
    setTown(s?.town ?? "");
    setKind(s?.kind ?? "");
    setCode(s?.accessCode ?? "");
  }, [target]);

  const submit = async () => {
    if (!name.trim() || !region.trim()) return;
    setBusy(true);
    const details = { town: town.trim() || null, kind: kind || null, access_code: code.trim() || null };
    try {
      const r = target && target !== "new"
        ? await stockpileApi.update(target.id, { name: name.trim(), region: region.trim(), ...details })
        : await stockpileApi.create(name.trim(), region.trim(), details);
      onSaved();
      notify({ title: t("stock.stockpile"), message: r.message, tone: "success" });
      onClose();
    } catch (err) {
      notify({ title: t("stock.stockpile"), message: errorText(err, t("stock.saveFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(target)} onClose={onClose} title={target === "new" ? t("stock.newClan") : t("clan.editStockpile")} icon="stockpile" widthClass="max-w-lg">
      <div className="grid gap-3">
        <RegionTownFields
          region={region}
          onRegion={setRegion}
          town={town}
          onTown={setTown}
          regionLabel={t("timers.regionHex")}
          townLabel={t("stock.town")}
          fallbackRegions={list<{ name: string }>("region").map((r) => r.payload.name)}
        />
        <Field label={t("stock.name")} value={name} onChange={(e) => setName(e.target.value)} placeholder={town || "Port Kirknell"} />
        <div>
          <div className="hud-label mb-1 text-muted">{t("stock.kind")}</div>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button key={k.key} type="button" className={`btn ${kind === k.key ? "btn-active" : ""}`} aria-pressed={kind === k.key} onClick={() => setKind(kind === k.key ? "" : k.key)}>
                {k.icon} {t(k.label)}
              </button>
            ))}
          </div>
        </div>
        <Field label={t("stock.password")} mono value={code} maxLength={32} autoComplete="off" onChange={(e) => setCode(e.target.value)} placeholder="123456" onKeyDown={(e) => e.key === "Enter" && void submit()} />
        <p className="hud-label text-muted">{t("stock.passwordHint")}</p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn btn-primary" disabled={busy || !name.trim() || !region.trim()} onClick={() => void submit()}>{busy ? t("common.sending") : t("common.save")}</button>
        </div>
      </div>
    </Modal>
  );
};
