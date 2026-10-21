"use client";

import * as React from "react";
import { catalogApi, itemName, type FoxholeItem } from "@/entities/item";
import { orderDraft, type DraftLine } from "@/entities/report";
import { Scopes, type Can } from "@/entities/session";
import { stockpileApi, type Stockpile } from "@/entities/stockpile";
import { FilterCards, ItemIcon, Loading, STORAGE_KEYS, UiGlyph, assetUrl, cn, errorText, readStorage, useConfirm, useI18n, useNotify, writeStorage } from "@/shared";
import { currentLevel, evaluatePyramid, pyramidApi, type Pyramid, type PyramidFaction, type PyramidLevel, type PyramidTier } from "@/features/supply/model/pyramid";

const UNIT_KEY = "sindaris-pyramid-stock-unit";

const FACTIONS: { key: PyramidFaction; label: "world.wardens" | "world.colonials" }[] = [
  { key: "warden", label: "world.wardens" },
  { key: "colonial", label: "world.colonials" },
];

/**
 * «Пирамида снабжения»: пирамида Маслоу для логистики (идея logihub.app/pyramid).
 * Уровень 1 — основа: пока он не закрыт на складе, выше не смотрим. Факт — закреплённый
 * склад (ящики), цели и уровни настраивает клан (право stockpiles:pyramid).
 */
export const PyramidWorkspace: React.FC<{ can: Can; onOpenConstructor: () => void }> = ({ can, onOpenConstructor }) => {
  const { t, locale } = useI18n();
  const notify = useNotify();
  const canEdit = can(Scopes.STOCKPILES_PYRAMID);
  const [pyramid, setPyramid] = React.useState<Pyramid | null>(null);
  const [draft, setDraft] = React.useState<{ faction: PyramidFaction; tiers: PyramidTier[] } | null>(null);
  const [catalog, setCatalog] = React.useState<Map<string, FoxholeItem>>(new Map());
  const [stockpiles, setStockpiles] = React.useState<Stockpile[]>([]);
  const [stockpileId, setStockpileId] = React.useState<string | null>(null);
  const [stockpile, setStockpile] = React.useState<Stockpile | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [armed, confirm] = useConfirm();
  // склады зданий (депо, порт) считают ящиками; если данные склада в штуках — переводим по размеру ящика
  const [stockUnit, setStockUnit] = React.useState<"crate" | "unit">("crate");
  React.useEffect(() => setStockUnit(readStorage<"crate" | "unit">(UNIT_KEY, "crate")), []);

  const fail = React.useCallback((err: unknown) => notify({ title: t("pyramid.title"), message: errorText(err, t("pyramid.loadFailed")), tone: "danger" }), [notify, t]);

  React.useEffect(() => {
    pyramidApi.get().then(setPyramid).catch(fail);
    catalogApi.all().then((items) => setCatalog(new Map(items.map((i) => [i.code, i])))).catch(fail);
    stockpileApi
      .list()
      .then((list) => {
        setStockpiles(list);
        const pinned = readStorage<string | null>(STORAGE_KEYS.pinnedStockpile, null);
        setStockpileId(list.some((s) => s.id === pinned) ? pinned : list[0]?.id ?? null);
      })
      .catch(fail);
  }, [fail]);

  React.useEffect(() => {
    if (!stockpileId) return setStockpile(null);
    stockpileApi.get(stockpileId).then(setStockpile).catch(fail);
  }, [stockpileId, fail]);

  const shown = draft ?? pyramid;
  const stock = React.useMemo(
    () =>
      new Map(
        (stockpile?.items ?? []).map((i) => [
          i.itemCode,
          stockUnit === "unit" ? Math.floor(i.quantity / Math.max(1, catalog.get(i.itemCode)?.crateSize ?? 1)) : i.quantity,
        ]),
      ),
    [stockpile, stockUnit, catalog],
  );
  const levels = React.useMemo(
    () => (shown ? evaluatePyramid(shown, stock, (code) => catalog.get(code)?.faction) : []),
    [shown, stock, catalog],
  );
  const now = currentLevel(levels);
  const label = (code: string) => {
    const item = catalog.get(code);
    return item ? itemName(item, locale) : code;
  };

  /** Недостающее до уровня upTo включительно -> в черновик конструктора заказа. */
  const toConstructor = (upTo: number) => {
    const lines: DraftLine[] = levels
      .filter((l) => l.index <= upTo)
      .flatMap((l) => l.cells.filter((c) => c.missing > 0))
      .map((c) => ({ name: label(c.code), item_code: c.code, quantity: c.missing, unit: "crate", icon_url: catalog.get(c.code)?.iconUrl ?? null }));
    if (!lines.length) return notify({ title: t("pyramid.title"), message: t("pyramid.nothingToBring"), tone: "success" });
    const merged = [...orderDraft.read().filter((d) => !lines.some((l) => l.item_code && l.item_code === d.item_code)), ...lines];
    orderDraft.write(merged);
    notify({ title: t("pyramid.title"), message: t("pyramid.sentToBuilder", { n: lines.length }), tone: "success" });
    onOpenConstructor();
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      setPyramid(await pyramidApi.save({ faction: draft.faction, tiers: draft.tiers.filter((tier) => tier.items.length) }));
      setDraft(null);
      notify({ title: t("pyramid.title"), message: t("pyramid.saved"), tone: "success" });
    } catch (err) {
      notify({ title: t("pyramid.title"), message: errorText(err, t("pyramid.saveFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const resetTemplate = async () => {
    setBusy(true);
    try {
      setPyramid(await pyramidApi.reset());
      setDraft(null);
      notify({ title: t("pyramid.title"), message: t("pyramid.resetDone"), tone: "warning" });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const editTiers = (fn: (tiers: PyramidTier[]) => PyramidTier[]) => setDraft((d) => (d ? { ...d, tiers: fn(d.tiers.map((tier) => ({ ...tier, items: [...tier.items] }))) } : d));

  if (!pyramid) return <div className="panel rounded-md"><Loading label={t("pyramid.loading")} /></div>;

  const totalMissing = levels.reduce((n, l) => n + l.missing, 0);
  const done = levels.filter((l) => l.done).length;

  return (
    <div className="tab-fade flex flex-col gap-3">
      <section className="panel panel-corners rounded-md p-4">
        <div className="flex flex-wrap items-start gap-3">
          <UiGlyph icon="pyramid" size={44} />
          <div className="min-w-0 flex-1">
            <div className="hud-label text-muted">{t("pyramid.kicker")}</div>
            <h1 className="panel-title mt-1 text-[1rem] md:text-[1.25rem]">{t("pyramid.title")}</h1>
            <p className="mt-1 max-w-3xl text-[0.8rem] text-white/70">{t("pyramid.hint")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && !draft ? (
              <button type="button" data-guide="pyramid-edit" className="btn" onClick={() => setDraft({ faction: pyramid.faction, tiers: pyramid.tiers })}>✎ {t("pyramid.edit")}</button>
            ) : null}
            {draft ? (
              <>
                <button type="button" className="btn" onClick={() => setDraft(null)} disabled={busy}>{t("common.cancel")}</button>
                <button type="button" className={cn("btn btn-danger", armed === "reset" && "btn-active")} disabled={busy} onClick={() => confirm("reset", () => void resetTemplate())}>
                  {armed === "reset" ? t("common.confirmQ") : `↺ ${t("pyramid.reset")}`}
                </button>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? t("common.sending") : t("common.save")}</button>
              </>
            ) : null}
          </div>
        </div>
        <div className="stencil-line mt-3" />
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="flex flex-col gap-1">
            <span className="hud-label text-muted">{t("pyramid.stockpile")}</span>
            <select data-guide="pyramid-stockpile" className="field h-11" value={stockpileId ?? ""} onChange={(e) => setStockpileId(e.target.value || null)}>
              {stockpiles.length === 0 ? <option value="">{t("pyramid.noStockpiles")}</option> : null}
              {stockpiles.map((s) => (
                <option key={s.id} value={s.id}>{s.region} ▶ {s.name}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <span className="hud-label text-muted">{t("pyramid.stockUnit")}</span>
            <FilterCards
              compact
              guide="pyramid-unit"
              label={t("pyramid.stockUnit")}
              items={[{ key: "crate", label: t("pyramid.inCrates") }, { key: "unit", label: t("pyramid.inUnits") }]}
              value={stockUnit}
              onChange={(k) => {
                if (!k) return;
                setStockUnit(k as "crate" | "unit");
                writeStorage(UNIT_KEY, k);
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="hud-label text-muted">{t("tools.faction")}</span>
            {draft ? (
              <FilterCards compact label={t("tools.faction")} items={FACTIONS.map((f) => ({ key: f.key, label: t(f.label) }))} value={draft.faction} onChange={(k) => k && setDraft({ ...draft, faction: k as PyramidFaction })} />
            ) : (
              <span className="cabinet-pill">{t(FACTIONS.find((f) => f.key === pyramid.faction)?.label ?? "world.wardens")}{pyramid.is_default ? ` • ${t("pyramid.template")}` : ""}</span>
            )}
          </div>
        </div>
      </section>

      {!draft ? (
        <section data-guide="pyramid-now" className={cn("panel panel-corners pyramid-now rounded-md p-4", now < 0 && "is-done")}>
          {now < 0 ? (
            <div className="panel-title text-safe">✔ {t("pyramid.allDone")}</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="hud-label text-warn">{t("pyramid.bringNow")}</div>
                  <div className="panel-title mt-1">
                    {t("pyramid.level", { n: now + 1 })}{levels[now].title ? ` • ${levels[now].title}` : ""} — {t("pyramid.missingCrates", { n: levels[now].missing })}
                  </div>
                  <div className="hud-label mt-1 text-muted">{t("pyramid.progress", { done, total: levels.length, n: totalMissing })}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary" data-guide="pyramid-order" onClick={() => toConstructor(now)}>📦 {t("pyramid.toBuilderLevel", { n: now + 1 })}</button>
                  <button type="button" className="btn" onClick={() => toConstructor(levels.length - 1)}>{t("pyramid.toBuilderAll")}</button>
                </div>
              </div>
              <div className="pyramid-now-list">
                {levels[now].cells.filter((c) => c.missing > 0).map((c) => (
                  <span key={c.code} className="pyramid-chip">
                    <ItemIcon sources={[assetUrl(catalog.get(c.code)?.iconUrl)]} size={26} label={label(c.code)} />
                    <span className="truncate">{label(c.code)}</span>
                    <b>+{c.missing}</b>
                  </span>
                ))}
              </div>
            </>
          )}
        </section>
      ) : null}

      <section data-guide="pyramid-tiers" className="panel panel-corners rounded-md p-4">
        {draft ? (
          <button type="button" className="btn mb-3 w-full" onClick={() => editTiers((tiers) => [...tiers, { title: "", items: [] }])}>＋ {t("pyramid.addTier")}</button>
        ) : null}
        <div className="pyramid">
          {[...levels].reverse().map((level) => (
            <TierRow
              key={level.index}
              level={level}
              count={levels.length}
              current={level.index === now && !draft}
              editing={Boolean(draft)}
              catalog={catalog}
              label={label}
              onEdit={editTiers}
              faction={(draft ?? pyramid).faction}
            />
          ))}
        </div>
        <p className="hud-label mt-3 text-center text-muted">{t("pyramid.legend")}</p>
      </section>
    </div>
  );
};

const TierRow: React.FC<{
  level: PyramidLevel;
  count: number;
  current: boolean;
  editing: boolean;
  catalog: Map<string, FoxholeItem>;
  label: (code: string) => string;
  onEdit: (fn: (tiers: PyramidTier[]) => PyramidTier[]) => void;
  faction: PyramidFaction;
}> = ({ level, count, current, editing, catalog, label, onEdit, faction }) => {
  const { t, locale } = useI18n();
  const [adding, setAdding] = React.useState("");
  const listId = React.useId();
  const i = level.index;
  // основа — во всю ширину, каждый уровень выше — уже
  const width = count > 1 ? 100 - (i / (count - 1)) * 40 : 100;
  const options = React.useMemo(
    () => [...catalog.values()].filter((it) => it.faction === "neutral" || it.faction === faction).map((it) => ({ code: it.code, name: itemName(it, locale) })),
    [catalog, faction, locale],
  );
  const add = () => {
    const found = options.find((o) => o.name.toLowerCase() === adding.trim().toLowerCase());
    if (!found) return;
    onEdit((tiers) => {
      if (!tiers[i].items.some((it) => it.code === found.code)) tiers[i].items.push({ code: found.code, crates: 1 });
      return tiers;
    });
    setAdding("");
  };

  return (
    <div className={cn("pyramid-tier", level.done ? "is-done" : current ? "is-current" : "")} style={{ width: `${width}%` }}>
      <div className="pyramid-tier-head">
        <span className="pyramid-tier-n">{t("pyramid.level", { n: i + 1 })}</span>
        {editing ? (
          <input className="field h-8 flex-1 py-1 text-xs" placeholder={t("pyramid.tierTitle")} value={level.title} maxLength={60}
            onChange={(e) => onEdit((tiers) => { tiers[i] = { ...tiers[i], title: e.target.value }; return tiers; })} />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[0.8rem] text-white/80">{level.title || (i === 0 ? t("pyramid.base") : "")}</span>
        )}
        {editing ? (
          <span className="flex gap-1">
            <button type="button" className="btn px-2 py-0.5" disabled={i === count - 1} title={t("pyramid.up")} onClick={() => onEdit((tiers) => { [tiers[i], tiers[i + 1]] = [tiers[i + 1], tiers[i]]; return tiers; })}>▲</button>
            <button type="button" className="btn px-2 py-0.5" disabled={i === 0} title={t("pyramid.down")} onClick={() => onEdit((tiers) => { [tiers[i], tiers[i - 1]] = [tiers[i - 1], tiers[i]]; return tiers; })}>▼</button>
            <button type="button" className="btn btn-danger px-2 py-0.5" title={t("pyramid.removeTier")} onClick={() => onEdit((tiers) => tiers.filter((_, k) => k !== i))}>✕</button>
          </span>
        ) : (
          <span className={cn("pyramid-tier-state", level.done ? "text-safe" : current ? "text-warn" : "text-muted")}>
            {level.done ? `✔ ${t("pyramid.closed")}` : `−${level.missing} ${t("unit.crate")}`}
          </span>
        )}
      </div>
      <div className="pyramid-cells">
        {level.cells.map((c) => {
          const ratio = c.target ? Math.min(1, c.have / c.target) : 1;
          const state = ratio >= 1 ? "ok" : ratio >= 0.5 ? "low" : "none";
          return (
            <div key={c.code} className={`pyramid-cell state-${state}`} title={`${label(c.code)}: ${c.have} / ${c.target} ${t("unit.crate")}`}>
              <ItemIcon sources={[assetUrl(catalog.get(c.code)?.iconUrl)]} size={40} label={label(c.code)} />
              <span className="min-w-0 flex-1">
                <span className="pyramid-cell-name">{label(c.code)}</span>
                {editing ? (
                  <span className="mt-1 flex items-center gap-1">
                    <input type="number" min={1} max={999} className="field h-7 w-16 py-0 text-xs" value={c.target}
                      onChange={(e) => {
                        const crates = Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1));
                        onEdit((tiers) => { tiers[i].items = tiers[i].items.map((it) => (it.code === c.code ? { ...it, crates } : it)); return tiers; });
                      }} />
                    <span className="hud-label text-muted">{t("unit.crate")}</span>
                  </span>
                ) : (
                  <>
                    <span className="pyramid-cell-qty">{c.have} / {c.target} {t("unit.crate")}</span>
                    <span className="pyramid-bar"><span style={{ width: `${ratio * 100}%` }} /></span>
                  </>
                )}
              </span>
              {editing ? (
                <button type="button" className="btn btn-danger px-1.5 py-0.5" aria-label={t("pyramid.removeItem")} onClick={() => onEdit((tiers) => { tiers[i].items = tiers[i].items.filter((it) => it.code !== c.code); return tiers; })}>✕</button>
              ) : null}
            </div>
          );
        })}
        {editing ? (
          <div className="pyramid-add">
            <input className="field h-9 flex-1 py-1 text-xs" list={listId} placeholder={t("pyramid.addItem")} value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <datalist id={listId}>
              {options.map((o) => (
                <option key={o.code} value={o.name} />
              ))}
            </datalist>
            <button type="button" className="btn btn-primary px-3" onClick={add}>＋</button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
