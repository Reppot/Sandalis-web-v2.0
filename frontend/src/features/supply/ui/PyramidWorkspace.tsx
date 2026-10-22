"use client";

import * as React from "react";
import { catalogApi, itemName, type FoxholeItem } from "@/entities/item";
import { orderDraft, type DraftLine } from "@/entities/report";
import { Scopes, type Can } from "@/entities/session";
import { stockpileApi, type Stockpile } from "@/entities/stockpile";
import {
  FilterCards,
  ItemIcon,
  Loading,
  Modal,
  STORAGE_KEYS,
  UiGlyph,
  assetUrl,
  cn,
  errorText,
  readStorage,
  useConfirm,
  useI18n,
  useNotify,
  writeStorage,
  xlsxToText,
  type MessageKey,
} from "@/shared";
import { currentLevel, evaluatePyramid, pyramidApi, type Pyramid, type PyramidFaction, type PyramidLevel, type PyramidTier } from "@/features/supply/model/pyramid";

type Source = "stockpile" | "bunker";
type StockUnit = "crate" | "unit";

/** Бункерная база: содержимое загружается файлом/буфером и живёт только на этой странице (нигде не хранится). */
interface BunkerBase {
  id: string;
  name: string;
  lines: { code: string; count: number }[];
  updatedAt: string;
}

// раньше базы сохранялись в браузере — эти данные больше не храним и стираем
const LEGACY_BUNKERS_KEY = "sindaris-bunker-bases";
const UNIT_KEY = (source: Source) => `sindaris-pyramid-unit-${source}`;
// склады зданий (депо, порт) считают ящиками, бункерная база — штуками
const DEFAULT_UNIT: Record<Source, StockUnit> = { stockpile: "crate", bunker: "unit" };
const CLAN = "clan";

const FACTIONS: { key: PyramidFaction; label: MessageKey }[] = [
  { key: "warden", label: "world.wardens" },
  { key: "colonial", label: "world.colonials" },
];
const presetLabel = (key: string) => `pyramid.preset.${key}` as MessageKey;

/**
 * «Пирамида снабжения»: пирамида Маслоу для логистики (идея logihub.app/pyramid).
 * Уровень 1 — основа: пока он не закрыт, выше не смотрим. Факт — склад клана или
 * бункерная база; конфигурация — пирамида клана или готовая (normal, tank, artillery...).
 */
export const PyramidWorkspace: React.FC<{ can: Can; onOpenConstructor: () => void }> = ({ can, onOpenConstructor }) => {
  const { t, locale } = useI18n();
  const notify = useNotify();
  const canEdit = can(Scopes.STOCKPILES_PYRAMID);
  const [pyramid, setPyramid] = React.useState<Pyramid | null>(null);
  const [config, setConfig] = React.useState<string>(CLAN);
  const [draft, setDraft] = React.useState<{ faction: PyramidFaction; tiers: PyramidTier[] } | null>(null);
  const [catalog, setCatalog] = React.useState<Map<string, FoxholeItem>>(new Map());
  const [source, setSource] = React.useState<Source>("stockpile");
  const [stockpiles, setStockpiles] = React.useState<Stockpile[] | null>(null);
  const [stockpileId, setStockpileId] = React.useState<string | null>(null);
  const [stockpile, setStockpile] = React.useState<Stockpile | null>(null);
  const [bunker, setBunker] = React.useState<BunkerBase | null>(null);
  const [units, setUnits] = React.useState<Record<Source, StockUnit>>(DEFAULT_UNIT);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [armed, confirm] = useConfirm();

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
    try {
      localStorage.removeItem(LEGACY_BUNKERS_KEY);
    } catch {
      // хранилище недоступно — и так ничего не сохранено
    }
    setUnits({ stockpile: readStorage(UNIT_KEY("stockpile"), DEFAULT_UNIT.stockpile), bunker: readStorage(UNIT_KEY("bunker"), DEFAULT_UNIT.bunker) });
  }, [fail]);

  React.useEffect(() => {
    if (!stockpileId) return setStockpile(null);
    stockpileApi.get(stockpileId).then(setStockpile).catch(fail);
  }, [stockpileId, fail]);


  // конфигурация на экране: черновик правки, пирамида клана или готовая
  const preset = pyramid?.presets.find((p) => p.key === config) ?? null;
  const shown = draft ?? (pyramid ? { faction: pyramid.faction, tiers: preset ? preset.tiers : pyramid.tiers } : null);

  const unit = units[source];
  const raw: { code: string; count: number }[] =
    source === "stockpile"
      ? (stockpile?.items ?? []).map((i) => ({ code: i.itemCode, count: i.quantity }))
      : bunker?.lines ?? [];
  const stock = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const { code, count } of raw) {
      const crates = unit === "unit" ? Math.floor(count / Math.max(1, catalog.get(code)?.crateSize ?? 1)) : count;
      map.set(code, (map.get(code) ?? 0) + crates);
    }
    return map;
    // raw пересобирается на каждый рендер — зависим от его источников
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, stockpile, bunker, unit, catalog]);

  const levels = React.useMemo(() => (shown ? evaluatePyramid(shown, stock, (code) => catalog.get(code)?.faction) : []), [shown, stock, catalog]);
  const now = currentLevel(levels);
  // в заказ по умолчанию — текущий уровень; при смене пирамиды или источника выбор сбрасывается
  React.useEffect(() => setSelected(new Set(now >= 0 ? [now] : [])), [now, config, source, stockpileId, levels.length, bunker]);

  const label = (code: string) => {
    const item = catalog.get(code);
    return item ? itemName(item, locale) : code;
  };

  /** Недостающее выбранных уровней -> в черновик конструктора заказа. */
  const toConstructor = (indices: number[]) => {
    const lines: DraftLine[] = levels
      .filter((l) => indices.includes(l.index))
      .flatMap((l) => l.cells.filter((c) => c.missing > 0))
      .map((c) => ({ name: label(c.code), item_code: c.code, quantity: c.missing, unit: "crate", icon_url: catalog.get(c.code)?.iconUrl ?? null }));
    if (!indices.length) return notify({ title: t("pyramid.title"), message: t("pyramid.selectedNone"), tone: "warning" });
    if (!lines.length) return notify({ title: t("pyramid.title"), message: t("pyramid.nothingToBring"), tone: "success" });
    // прошлый состав конструктора (например, самолёты) не смешивается с заказом пирамиды
    orderDraft.write(lines);
    notify({ title: t("pyramid.title"), message: t("pyramid.sentToBuilder", { n: lines.length }), tone: "success" });
    onOpenConstructor();
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      setPyramid(await pyramidApi.save({ faction: draft.faction, tiers: draft.tiers.filter((tier) => tier.items.length) }));
      setDraft(null);
      setConfig(CLAN);
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
      setConfig(CLAN);
      notify({ title: t("pyramid.title"), message: t("pyramid.resetDone"), tone: "warning" });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const editTiers = (fn: (tiers: PyramidTier[]) => PyramidTier[]) => setDraft((d) => (d ? { ...d, tiers: fn(d.tiers.map((tier) => ({ ...tier, items: [...tier.items] }))) } : d));
  const startEdit = () => pyramid && setDraft({ faction: pyramid.faction, tiers: preset ? preset.tiers : pyramid.tiers });

  if (!pyramid) return <div className="panel rounded-md"><Loading label={t("pyramid.loading")} /></div>;

  const totalMissing = levels.reduce((n, l) => n + l.missing, 0);
  const done = levels.filter((l) => l.done).length;
  const picked = [...selected].sort((a, b) => a - b);
  const pickedMissing = levels.filter((l) => selected.has(l.index)).reduce((n, l) => n + l.missing, 0);

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
              <button type="button" data-guide="pyramid-edit" className="btn" onClick={startEdit}>
                ✎ {preset ? t("pyramid.useAsBase") : t("pyramid.edit")}
              </button>
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

        <div className="pyramid-controls">
          <label className="flex flex-col gap-1">
            <span className="hud-label text-muted">{t("pyramid.config")}</span>
            <select data-guide="pyramid-config" className="field h-11" value={draft ? CLAN : config} disabled={Boolean(draft)} onChange={(e) => setConfig(e.target.value)}>
              <option value={CLAN}>{t("pyramid.clanConfig")}{pyramid.is_default ? ` (${t("pyramid.template")})` : ""}</option>
              {pyramid.presets.map((p) => (
                <option key={p.key} value={p.key}>{t(presetLabel(p.key))}</option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1">
            <span className="hud-label text-muted">{t("pyramid.source")}</span>
            <FilterCards
              compact
              guide="pyramid-source"
              label={t("pyramid.source")}
              items={[{ key: "stockpile", label: `🏬 ${t("pyramid.sourceStockpile")}` }, { key: "bunker", label: `🛡 ${t("pyramid.sourceBunker")}` }]}
              value={source}
              onChange={(k) => k && setSource(k as Source)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="hud-label text-muted">{t("pyramid.stockUnit")}</span>
            <FilterCards
              compact
              guide="pyramid-unit"
              label={t("pyramid.stockUnit")}
              items={[{ key: "crate", label: t("pyramid.inCrates") }, { key: "unit", label: t("pyramid.inUnits") }]}
              value={unit}
              onChange={(k) => {
                if (!k) return;
                setUnits((u) => ({ ...u, [source]: k as StockUnit }));
                writeStorage(UNIT_KEY(source), k);
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="hud-label text-muted">{t("tools.faction")}</span>
            {draft ? (
              <FilterCards compact label={t("tools.faction")} items={FACTIONS.map((f) => ({ key: f.key, label: t(f.label) }))} value={draft.faction} onChange={(k) => k && setDraft({ ...draft, faction: k as PyramidFaction })} />
            ) : (
              <span className="cabinet-pill">{t(FACTIONS.find((f) => f.key === pyramid.faction)?.label ?? "world.wardens")}</span>
            )}
          </div>
        </div>

        {source === "stockpile" ? (
          <label className="mt-3 flex flex-col gap-1">
            <span className="hud-label text-muted">{t("pyramid.stockpile")}</span>
            <select data-guide="pyramid-stockpile" className="field h-11" value={stockpileId ?? ""} onChange={(e) => setStockpileId(e.target.value || null)}>
              {!stockpiles ? <option value="">{t("common.loading")}</option> : stockpiles.length === 0 ? <option value="">{t("pyramid.noStockpiles")}</option> : null}
              {(stockpiles ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.region} ▶ {s.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <BunkerPanel bunker={bunker} onLoad={setBunker} />
        )}
        {preset && !draft ? <p className="hud-label mt-3 text-muted">{t("pyramid.presetHint")}</p> : null}
      </section>

      {!draft ? (
        <section data-guide="pyramid-now" className={cn("panel panel-corners pyramid-now rounded-md p-4", now < 0 && "is-done")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              {now < 0 ? (
                <div className="panel-title text-safe">✔ {t("pyramid.allDone")}</div>
              ) : (
                <>
                  <div className="hud-label text-warn">{t("pyramid.bringNow")}</div>
                  <div className="panel-title mt-1">
                    {t("pyramid.level", { n: now + 1 })}{levels[now].title ? ` • ${levels[now].title}` : ""} — {t("pyramid.missingCrates", { n: levels[now].missing })}
                  </div>
                </>
              )}
              <div className="hud-label mt-1 text-muted">{t("pyramid.progress", { done, total: levels.length, n: totalMissing })}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="hud-label text-muted">
                {picked.length ? t("pyramid.selectedLevels", { list: picked.map((i) => i + 1).join(", "), n: pickedMissing }) : t("pyramid.selectedNone")}
              </span>
              <button type="button" className="btn btn-primary" data-guide="pyramid-order" disabled={!picked.length} onClick={() => toConstructor(picked)}>
                📦 {t("pyramid.toBuilderSelected")}
              </button>
              <button type="button" className="btn" onClick={() => setSelected(new Set(levels.filter((l) => !l.done).map((l) => l.index)))}>{t("pyramid.selectAllMissing")}</button>
            </div>
          </div>
          {now >= 0 ? (
            <div className="pyramid-now-list">
              {levels[now].cells.filter((c) => c.missing > 0).map((c) => (
                <span key={c.code} className="pyramid-chip">
                  <ItemIcon sources={[assetUrl(catalog.get(c.code)?.iconUrl)]} size={26} label={label(c.code)} />
                  <span className="truncate">{label(c.code)}</span>
                  <b>+{c.missing}</b>
                </span>
              ))}
            </div>
          ) : null}
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
              selected={selected.has(level.index)}
              onToggle={() =>
                setSelected((s) => {
                  const next = new Set(s);
                  if (next.has(level.index)) next.delete(level.index);
                  else next.add(level.index);
                  return next;
                })
              }
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

/** Бункерные базы: выбор, загрузка содержимого (JSON / TXT / XLSX / буфер), удаление. */
/** Бункерная база: загрузка содержимого (JSON / TXT / XLSX / буфер) — только для этой страницы, без сохранения. */
const BunkerPanel: React.FC<{ bunker: BunkerBase | null; onLoad: (b: BunkerBase | null) => void }> = ({ bunker, onLoad }) => {
  const { t } = useI18n();
  const notify = useNotify();
  const [name, setName] = React.useState("");
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [pasteText, setPasteText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const textInput = React.useRef<HTMLInputElement>(null);
  const xlsxInput = React.useRef<HTMLInputElement>(null);

  const importText = async (text: string) => {
    if (!text.trim()) return notify({ title: t("pyramid.sourceBunker"), message: t("import.clipboardEmpty"), tone: "warning" });
    setBusy(true);
    try {
      const parsed = await catalogApi.parse(text);
      const lines = parsed.lines.filter((l) => l.item && l.count > 0).map((l) => ({ code: l.item!.code, count: l.count }));
      if (!lines.length) return notify({ title: t("import.formatError"), message: t("import.formatHelp"), tone: "danger" });
      const base: BunkerBase = { id: "session", name: name.trim() || t("pyramid.sourceBunker"), lines, updatedAt: new Date().toISOString() };
      onLoad(base);
      notify({ title: t("pyramid.sourceBunker"), message: t("pyramid.bunkerLoaded", { n: lines.length, name: base.name }), tone: "success" });
      if (parsed.unknown.length) notify({ title: t("import.notInCatalog"), message: parsed.unknown.slice(0, 6).join(" • "), tone: "warning" });
    } catch (err) {
      notify({ title: t("pyramid.sourceBunker"), message: errorText(err, t("builder.serverParseFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const pick = (ref: React.RefObject<HTMLInputElement | null>) => {
    if (!ref.current) return;
    ref.current.value = "";
    ref.current.click();
  };

  return (
    <div data-guide="pyramid-bunker" className="pyramid-bunker">
      <label className="flex flex-col gap-1">
        <span className="hud-label text-muted">{t("pyramid.bunkerName")}</span>
        <input className="field h-11" value={name} placeholder={t("pyramid.bunkerNamePlaceholder")} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="hud-label text-muted">{bunker ? t("pyramid.bunkerReload") : t("pyramid.bunkerLoad")}:</span>
        <button type="button" className="btn" disabled={busy} onClick={() => pick(textInput)}>JSON / TXT</button>
        <button type="button" className="btn" disabled={busy} onClick={() => pick(xlsxInput)}>XLSX</button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() =>
            navigator.clipboard
              .readText()
              .then((text) => void importText(text))
              .catch(() => {
                setPasteText("");
                setPasteOpen(true);
              })
          }
        >
          {t("export.fmt.clipboard")}
        </button>
        {bunker ? (
          <span className="hud-label text-accent">✔ {bunker.name} • {t("pyramid.bunkerLines", { n: bunker.lines.length })}</span>
        ) : null}
      </div>
      <p className="hud-label mt-2 text-muted">{t("pyramid.bunkerHint")}</p>

      <input ref={textInput} type="file" accept=".json,.txt,application/json,text/plain" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void file.text().then(importText);
      }} />
      <input ref={xlsxInput} type="file" accept=".xlsx" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void xlsxToText(file).then(importText).catch((err) => notify({ title: "XLSX", message: errorText(err, t("import.xlsxFailed")), tone: "danger" }));
      }} />
      <Modal open={pasteOpen} onClose={() => setPasteOpen(false)} title={t("pyramid.sourceBunker")} icon="clipboard" widthClass="max-w-lg">
        <p className="hud-label text-muted">{t("import.pasteHelp")}</p>
        <textarea className="field field-mono mt-2 h-48 w-full resize-y text-xs" value={pasteText} onChange={(e) => setPasteText(e.target.value)} autoFocus />
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn" onClick={() => setPasteOpen(false)}>{t("common.cancel")}</button>
          <button className="btn btn-primary" onClick={() => { setPasteOpen(false); void importText(pasteText); }}>{t("import.recognize")}</button>
        </div>
      </Modal>
    </div>
  );
};

const TierRow: React.FC<{
  level: PyramidLevel;
  count: number;
  current: boolean;
  editing: boolean;
  selected: boolean;
  onToggle: () => void;
  catalog: Map<string, FoxholeItem>;
  label: (code: string) => string;
  onEdit: (fn: (tiers: PyramidTier[]) => PyramidTier[]) => void;
  faction: PyramidFaction;
}> = ({ level, count, current, editing, selected, onToggle, catalog, label, onEdit, faction }) => {
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
    <div className={cn("pyramid-tier", level.done ? "is-done" : current ? "is-current" : "", selected && !editing && "is-selected")} style={{ width: `${width}%` }}>
      <div className="pyramid-tier-head">
        {editing ? null : (
          <button type="button" className={cn("pyramid-pick", selected && "is-on")} aria-pressed={selected} onClick={onToggle} title={t("pyramid.selectForOrder")}>
            {selected ? "☑" : "☐"} <span>{t("pyramid.toOrder")}</span>
          </button>
        )}
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
