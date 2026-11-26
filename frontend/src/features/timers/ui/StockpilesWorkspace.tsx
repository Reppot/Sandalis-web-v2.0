"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { Scopes, type Can } from "@/entities/session";
import { stockpileApi, type Stockpile, type StockpileKind } from "@/entities/stockpile";
import { RegionTownFields } from "@/entities/world";
import { catalogApi, codeSynonyms } from "@/entities/item";
import {
  EmptyState,
  Field,
  Hint,
  ItemIcon,
  assetUrl,
  Loading,
  Modal,
  PagedMore,
  Icon,
  SearchField,
  Segmented,
  copyText,
  errorText,
  matchesWords,
  formatCountdown,
  formatDateTime,
  secondsLeft,
  severityOf,
  timeUnits,
  useI18n,
  useNotify,
  usePaged,
  type IconName,
  type MessageKey,
} from "@/shared";
import { useClock, useRiskSummary, useTerminal, type MonitoredTimer } from "@/features/timers/model";
import { RegisterTimerModal, TimerManagerModal } from "@/features/timers/ui/TimerModals";

const BAR = { critical: "var(--danger)", warning: "var(--warning)", safe: "var(--success)" } as const;
const KINDS: { key: StockpileKind; label: MessageKey; icon: IconName }[] = [
  { key: "seaport", label: "stock.kind.seaport", icon: "anchor" },
  { key: "depot", label: "stock.kind.depot", icon: "warehouse" },
  { key: "other", label: "stock.kind.other", icon: "home" },
];
/** Сколько позиций склада видно сразу — остальное по кнопке «Показать все». */
const PREVIEW = 8;
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
  const [filter, setFilter] = React.useState<"all" | "risk" | "safe" | "none">("all");
  const [managedId, setManagedId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Stockpile | "new" | null>(null);
  const [monitor, setMonitor] = React.useState<{ region: string; location: string } | null>(null);
  const [shown, setShown] = React.useState<Set<string>>(new Set());
  const [contents, setContents] = React.useState<Stockpile | null>(null);
  // содержимое складов видно всегда; здесь — склады, где его свернули вручную
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const toggle = (id: string, open?: boolean) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (open ?? next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

  // фильтр по состоянию таймера: под угрозой — истёк, критично или внимание
  const stateOf = React.useCallback(
    (r: Row): "risk" | "safe" | "none" => {
      if (!r.timer || r.timer.completed_at) return "none";
      return severityOf(secondsLeft(r.timer.ends_at, now || Date.now())) === "safe" ? "safe" : "risk";
    },
    [now],
  );
  const counts = React.useMemo(() => {
    const c = { all: rows.length, risk: 0, safe: 0, none: 0 };
    for (const r of rows) c[stateOf(r)] += 1;
    return c;
  }, [rows, stateOf]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "all" || stateOf(r) === filter) &&
        (!q || matchesWords(`${r.stockpile?.name ?? r.timer?.title ?? ""} ${r.stockpile?.region ?? ""} ${r.stockpile?.town ?? ""}`, q)),
    );
  }, [rows, query, filter, stateOf]);
  const page = usePaged(visible, 30, `${query}|${filter}`);
  const managed = managedId ? timers.find((tm) => tm.id === managedId) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="section-title flex items-center gap-2">{t("clan.stockpilesTitle")}<Hint>{t("hint.stockpileTimer")}</Hint></h2>
            <p className="mt-0.5 text-sm text-fg-3">{t("clan.stockpilesHint")}</p>
          </div>
          {can(Scopes.STOCKPILES_CREATE) ? (
            <button className="btn btn-primary h-10" data-guide="stockpile-new" onClick={() => setEditing("new")}>
              <Icon name="plus" size={16} />
              {t("stock.newClan")}
            </button>
          ) : null}
        </div>
        <div data-guide="timers-stats" className="risk-stats mt-4">
          <Stat label={t("clan.stockpilesTitle")} value={rows.length} tone="neutral" />
          <Stat label={t("timers.critical")} value={risk.critical} tone="danger" />
          <Stat label={t("timers.warning")} value={risk.warning} tone="warning" />
          <Stat label={t("timers.safe")} value={risk.safe} tone="success" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Segmented
            label={t("stock.filter")}
            value={filter}
            onChange={setFilter}
            className="max-w-full overflow-x-auto"
            options={[
              { value: "all", label: <>{t("common.all")} <span className="opacity-60">{counts.all}</span></> },
              { value: "risk", label: <>{t("stock.filterRisk")} <span className="opacity-60">{counts.risk}</span></> },
              { value: "safe", label: <>{t("stock.filterSafe")} <span className="opacity-60">{counts.safe}</span></> },
              { value: "none", label: <>{t("stock.filterNoTimer")} <span className="opacity-60">{counts.none}</span></> },
            ]}
          />
          <SearchField className="min-w-[12rem] flex-1" data-guide="timers-search" placeholder={t("timers.search")} value={query} onChange={setQuery} />
          <button className="btn h-10" onClick={() => void refresh()} title={t("common.syncHint")}>
            <Icon name="refresh" size={15} />
            <span className="hidden sm:inline">{t("common.sync")}</span>
          </button>
        </div>
      </section>

      {loading ? (
        <div className="panel"><Loading label={t("timers.loading")} /></div>
      ) : visible.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon="stockpile"
            title={rows.length ? t("common.nothingFound") : t("clan.noStockpiles")}
            hint={rows.length ? t("common.nothingFilter") : t("clan.noStockpilesHint")}
            actions={
              rows.length ? (
                <button type="button" className="btn" onClick={() => { setQuery(""); setFilter("all"); }}>{t("sheet.reset")}</button>
              ) : can(Scopes.STOCKPILES_CREATE) ? (
                <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}><Icon name="plus" size={16} />{t("stock.newClan")}</button>
              ) : null
            }
          >
            {connection === "offline" && <div className="text-sm text-danger">{t("common.noDb")}</div>}
          </EmptyState>
        </div>
      ) : (
        <ul data-guide="clan-stockpiles" className="flex flex-col gap-3">
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
              expanded={Boolean(row.stockpile && !collapsed.has(row.stockpile.id))}
              onToggleItems={() => row.stockpile && toggle(row.stockpile.id)}
              onMonitor={() => row.stockpile && setMonitor({ region: row.stockpile.region, location: row.stockpile.name })}
            />
          ))}
        </ul>
      )}
      {visible.length > 0 && <PagedMore page={page} />}

      {managed && <TimerManagerModal timer={managed} can={can} onClose={() => setManagedId(null)} />}
      <RegisterTimerModal open={Boolean(monitor)} preset={monitor} onClose={() => setMonitor(null)} />
      <StockpileContentsModal
        target={contents}
        onClose={() => setContents(null)}
        onSaved={(id) => {
          toggle(id, true);
          void refresh();
        }}
      />
      <StockpileDetailsModal target={editing} onClose={() => setEditing(null)} onSaved={() => void refresh()} />
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number; tone: "neutral" | "danger" | "warning" | "success" }> = ({ label, value, tone }) => (
  <div className={`risk-stat is-${tone}`}>
    <span className="risk-stat-dot" aria-hidden />
    <span className="risk-stat-value">{value}</span>
    <span className="risk-stat-label">{label}</span>
  </div>
);

const StockpileCard: React.FC<{
  row: Row;
  now: number;
  can: Can;
  revealed: boolean;
  onReveal: () => void;
  onManage: () => void;
  onEdit: () => void;
  onContents: () => void;
  expanded: boolean;
  onToggleItems: () => void;
  onMonitor: () => void;
}> = ({ row, now, can, revealed, onReveal, onManage, onEdit, onContents, expanded, onToggleItems, onMonitor }) => {
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
    <li className={`timer-card stockpile-card sev-${active ? sev : "none"}`}>
      {bg ? <span className="stockpile-card-art" style={{ backgroundImage: `url(${bg})` }} aria-hidden /> : null}
      <div className="stockpile-card-grid">
        <span className="clan-stockpile-kind" title={kind ? t(kind.label) : undefined}>
          <Icon name={kind?.icon ?? "warehouse"} size={20} />
        </span>

        <div className="min-w-0">
          <div className="truncate text-[1.02rem] font-semibold tracking-[-0.01em] text-fg">{s?.name ?? timer?.title}</div>
          <div className="clan-stockpile-meta flex items-center gap-1">
            <Icon name="map" size={13} />
            {s?.region ?? "—"}{s?.town ? ` · ${s.town}` : ""}{kind ? ` · ${t(kind.label)}` : ""}
          </div>
          <div className="stockpile-card-info">
            <span className="flex items-center gap-1.5">
              <Icon name="lock" size={14} className="text-fg-3" />
              <span className="sr-only">{t("stock.password")}</span>
              {s?.accessCode ? (
                <>
                  <code className="clan-stockpile-code">{revealed ? s.accessCode : "•".repeat(Math.min(8, s.accessCode.length))}</code>
                  <button type="button" className="icon-btn" title={revealed ? t("stock.hide") : t("stock.show")} aria-label={revealed ? t("stock.hide") : t("stock.show")} onClick={onReveal}>
                    <Icon name={revealed ? "eyeOff" : "eye"} size={15} />
                  </button>
                  <button type="button" className="icon-btn" title={t("common.copy")} aria-label={t("common.copy")}
                    onClick={() => void copyText(s.accessCode!).then((ok) => ok && notify({ title: s.name, message: t("stock.passwordCopied"), tone: "success" }))}>
                    <Icon name="copy" size={15} />
                  </button>
                </>
              ) : (
                <span className="text-xs text-fg-3">{t("stock.noPassword")}</span>
              )}
            </span>
            {s ? (
              <button type="button" className={`stockpile-items-toggle ${expanded ? "is-open" : ""}`} aria-expanded={expanded} disabled={!s.itemsCount} onClick={onToggleItems}>
                <Icon name="box" size={14} />
                {t("clan.stockpileLines", { n: s.itemsCount })}{s.lastSyncSource === "scan" ? " · MapData.sav" : ""}{s.lastSyncAt ? ` · ${formatDateTime(new Date(s.lastSyncAt))}` : ""}
                {s.itemsCount ? <Icon name="chevronDown" size={14} className={expanded ? "rotate-180" : ""} /> : null}
              </button>
            ) : null}
          </div>
        </div>

        <div className="stockpile-card-timer">
          {timer ? (
            <>
              <div className="text-xs font-medium text-fg-3">
                {timer.completed_at ? t("timers.completed") : ts > 0 ? t(sev === "critical" ? "timers.sevCritical" : sev === "warning" ? "timers.sevWarning" : "timers.sevSafe") : t("timers.timerExpired")}
              </div>
              <div data-guide="timer-left" className={`timer-value ${sev === "critical" && ts > 0 && active ? "pulse" : ""}`}>
                {!active ? "—" : ts > 0 ? formatCountdown(ts, timeUnits(t)) : "00:00:00"}
              </div>
              <div className="progress-track mt-1.5 w-full">
                <div className="progress-bar" style={{ width: `${active ? pct : 100}%`, background: BAR[sev] }} />
              </div>
            </>
          ) : (
            <div className="text-sm text-fg-3">{t("clan.noTimer")}</div>
          )}
        </div>

        <div className="stockpile-card-actions">
          {timer ? (
            <button className="btn" data-guide="timer-manage" onClick={onManage}>
              <Icon name="clock" size={15} />
              {t("timers.manage")}
            </button>
          ) : s && can(Scopes.TIMERS_CREATE) ? (
            <button className="btn btn-primary" onClick={onMonitor}>
              <Icon name="clock" size={15} />
              {t("clan.startTimer")}
            </button>
          ) : null}
          {s && can(Scopes.STOCKPILES_ITEMS) ? (
            <button className="btn" data-guide="stockpile-contents" onClick={onContents}>
              <Icon name="upload" size={15} />
              {t("stock.updateContents")}
            </button>
          ) : null}
          {s && can(Scopes.STOCKPILES_EDIT) ? (
            <button className="btn btn-icon" title={t("clan.editStockpile")} aria-label={t("clan.editStockpile")} onClick={onEdit}>
              <Icon name="edit" size={16} />
            </button>
          ) : null}
        </div>
      </div>
      {s && expanded && s.itemsCount ? <StockpileItems stockpile={s} /> : null}
    </li>
  );
};

/** Содержимое склада: грузится при раскрытии и после каждой синхронизации (lastSyncAt). */
const StockpileItems: React.FC<{ stockpile: Stockpile }> = ({ stockpile }) => {
  const { t, locale } = useI18n();
  const [items, setItems] = React.useState<Stockpile["items"] | null>(null);
  const [query, setQuery] = React.useState("");
  const [all, setAll] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    stockpileApi
      .items(stockpile.id)
      .then((list) => !cancelled && setItems(list))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [stockpile.id, stockpile.lastSyncAt]);

  if (!items) return <div className="stockpile-items"><Loading rows={2} /></div>;
  const name = (i: Stockpile["items"][number]) => (locale === "ru" ? i.name ?? i.nameEn : i.nameEn ?? i.name) ?? i.itemCode;
  const needle = query.trim();
  const shown = [...items]
    // оба языка, код и сокращения: «basic material», «бмат»
    .filter((i) => !needle || matchesWords(`${i.name ?? ""} ${i.nameEn ?? ""} ${i.itemCode} ${codeSynonyms(i.itemCode).join(" ")}`, needle))
    .sort((a, b) => b.quantity + b.looseQuantity - (a.quantity + a.looseQuantity));
  return (
    <div className="stockpile-items" data-guide="stockpile-items">
      {items.length > 12 ? (
        <SearchField className="mb-3 max-w-sm" placeholder={t("stock.searchItems")} value={query} onChange={setQuery} />
      ) : null}
      {shown.length ? (
        <ul className="stockpile-items-grid">
          {(needle || all ? shown : shown.slice(0, PREVIEW)).map((i) => (
            <li key={i.id} className="stockpile-item" title={name(i)}>
              <ItemIcon sources={[assetUrl(i.iconUrl)]} size={34} label={name(i)} />
              <span className="min-w-0 flex-1 truncate">{name(i)}</span>
              <span className="stockpile-item-qty">
                {i.quantity ? <b title={t("unit.crate")}>{i.quantity.toLocaleString()} {t("unit.crate")}</b> : null}
                {i.looseQuantity ? <em title={t("stock.loose")}>{i.looseQuantity.toLocaleString()} {t("unit.unit")}</em> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-3">{t("common.nothingFound")}</p>
      )}
      {!needle && shown.length > PREVIEW ? (
        <button type="button" className="report-more" onClick={() => setAll((v) => !v)}>
          {all ? t("stock.showLess") : t("stock.showAllItems", { n: shown.length })}
          <Icon name="chevronDown" size={15} className={all ? "rotate-180" : ""} />
        </button>
      ) : null}
    </div>
  );
};

/** «Обновить содержимое»: вставленный JSON (или текст) сканера заменяет содержимое склада. */
const StockpileContentsModal: React.FC<{ target: Stockpile | null; onClose: () => void; onSaved: (id: string) => void }> = ({ target, onClose, onSaved }) => {
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
      const items = parsed.lines.filter((l) => l.item && l.count > 0).map((l) => ({ item_code: l.item!.code, quantity: l.count, unit: l.unit }));
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
      onSaved(target.id);
      onClose();
    } catch (err) {
      notify({ title: t("stock.updateContents"), message: errorText(err, t("stock.notSaved")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(target)} onClose={onClose} title={`${t("stock.updateContents")} · ${target?.name ?? ""}`} icon="stockpile" widthClass="max-w-2xl">
      <div className="grid gap-3">
        <p className="text-[0.85rem] text-fg-2">{t("stock.updateContentsHint")}</p>
        <textarea className="field field-mono min-h-[16rem] text-[0.75rem]" autoFocus spellCheck={false} value={text} placeholder='{ "items": [ ... ] }' onChange={(e) => setText(e.target.value)} />
        <p className="flex items-start gap-2 text-sm text-warn"><Icon name="warning" size={16} className="mt-0.5" />{t("stock.updateContentsWarn")}</p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void submit()}>{busy ? t("common.sending") : t("stock.updateContents")}</button>
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
          <div className="field-label mb-1.5">{t("stock.kind")}</div>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button key={k.key} type="button" className={`btn ${kind === k.key ? "btn-active" : ""}`} aria-pressed={kind === k.key} onClick={() => setKind(kind === k.key ? "" : k.key)}>
                <Icon name={k.icon} size={15} />
                {t(k.label)}
              </button>
            ))}
          </div>
        </div>
        <Field label={t("stock.password")} mono value={code} maxLength={32} autoComplete="off" onChange={(e) => setCode(e.target.value)} placeholder="123456" onKeyDown={(e) => e.key === "Enter" && void submit()} />
        <p className="text-xs text-fg-3">{t("stock.passwordHint")}</p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn btn-primary" disabled={busy || !name.trim() || !region.trim()} onClick={() => void submit()}>{busy ? t("common.sending") : t("common.save")}</button>
        </div>
      </div>
    </Modal>
  );
};
