"use client";

import * as React from "react";
import { catalogApi, itemName, type FoxholeItem } from "@/entities/item";
import { orderDraft, type DraftLine } from "@/entities/report";
import { Scopes, type Can } from "@/entities/session";
import { stockpileApi, type Stockpile } from "@/entities/stockpile";
import {
  ItemIcon,
  Loading,
  Modal,
  STORAGE_KEYS,
  UiGlyph,
  assetUrl,
  cn,
  errorText,
  matchesWords,
  readStorage,
  useConfirm,
  useI18n,
  useNotify,
  writeStorage,
  xlsxToText,
  type MessageKey,
  Icon,
  PageHeader,
  Segmented,
} from "@/shared";
import { currentLevel, evaluatePyramid, pyramidApi, type Pyramid, type PyramidFaction, type PyramidLevel, type PyramidTier } from "@/features/supply/model/pyramid";
import { itemSearchHay } from "@/entities/item";

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
// конфигурация на экране: ключ готовой («normal», «tank»…) или «custom:<id>» — своя пирамида клана;
// при входе всегда «Обычная»
const CUSTOM_PREFIX = "custom:";
const DEFAULT_CONFIG = "normal";

/** Черновик правки: id — изменяем сохранённую конфигурацию, null — новая «Кастомная». */
interface Draft {
  id: string | null;
  name: string;
  faction: PyramidFaction;
  tiers: PyramidTier[];
}
const cloneTiers = (tiers: PyramidTier[]) => tiers.map((tier) => ({ ...tier, items: tier.items.map((it) => ({ ...it })) }));
// техника и сооружения в пирамиду не входят (сервер это тоже проверяет)
const NOT_IN_PYRAMID = new Set(["vehicles", "structures"]);

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
  const canCreate = can(Scopes.PYRAMID_CREATE);
  const canEdit = can(Scopes.PYRAMID_EDIT);
  const canDelete = can(Scopes.PYRAMID_DELETE);
  const [pyramid, setPyramid] = React.useState<Pyramid | null>(null);
  const [config, setConfig] = React.useState<string>(DEFAULT_CONFIG);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  // фракция просмотра — меняется без правки конфигурации
  const [viewFaction, setViewFaction] = React.useState<PyramidFaction>("warden");
  const [naming, setNaming] = React.useState(false);
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
    pyramidApi
      .get()
      .then((p) => {
        setPyramid(p);
        setViewFaction(p.faction);
        if (!p.presets.some((x) => x.key === DEFAULT_CONFIG)) setConfig(p.presets[0]?.key ?? DEFAULT_CONFIG);
      })
      .catch(fail);
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


  // конфигурация на экране: черновик правки, своя пирамида клана или готовая
  const preset = pyramid?.presets.find((p) => p.key === config) ?? null;
  const custom = config.startsWith(CUSTOM_PREFIX) ? pyramid?.configs.find((c) => CUSTOM_PREFIX + c.id === config) ?? null : null;
  // Верхняя ступень больше не входит в планирование: скрываем её у готовых и клановых схем,
  // а при сохранении черновика в API уже уйдёт отредактированный набор без этой ступени.
  const shown = draft ?? (pyramid ? { faction: viewFaction, tiers: (custom?.tiers ?? preset?.tiers ?? pyramid.tiers).slice(1) } : null);

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

  /** Сохранение — после окна «Назовите конфигурацию». */
  const save = async (name: string) => {
    if (!draft) return;
    setBusy(true);
    const body = { name, faction: draft.faction, tiers: draft.tiers.filter((tier) => tier.items.length) };
    try {
      const next = draft.id ? await pyramidApi.update(draft.id, body) : await pyramidApi.create(body);
      setPyramid(next);
      const saved = draft.id ? next.configs.find((c) => c.id === draft.id) : next.configs.find((c) => c.name.toLowerCase() === name.trim().replace(/\s+/g, " ").toLowerCase());
      if (saved) {
        setConfig(CUSTOM_PREFIX + saved.id);
        setViewFaction(saved.faction);
      }
      setDraft(null);
      setNaming(false);
      notify({ title: t("pyramid.title"), message: t("pyramid.savedNamed", { name: saved?.name ?? name }), tone: "success" });
    } catch (err) {
      notify({ title: t("pyramid.title"), message: errorText(err, t("pyramid.saveFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const removeConfig = async (id: string) => {
    setBusy(true);
    try {
      setPyramid(await pyramidApi.remove(id));
      setConfig(DEFAULT_CONFIG);
      notify({ title: t("pyramid.title"), message: t("pyramid.configDeleted"), tone: "warning" });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const editTiers = (fn: (tiers: PyramidTier[]) => PyramidTier[]) => setDraft((d) => (d ? { ...d, tiers: fn(d.tiers.map((tier) => ({ ...tier, items: [...tier.items] }))) } : d));
  /** Карточка конфигурации: готовые и свои пирамиды клана — просмотр. */
  const pickConfig = (key: string) => {
    setDraft(null);
    setConfig(key);
    const own = pyramid?.configs.find((c) => CUSTOM_PREFIX + c.id === key);
    if (own) setViewFaction(own.faction);
  };
  /** «Кастомная»: новая своя пирамида на основе того, что на экране. */
  const startCustom = () => shown && setDraft({ id: null, name: "", faction: viewFaction, tiers: cloneTiers(shown.tiers) });
  const startEditOwn = () => custom && setDraft({ id: custom.id, name: custom.name, faction: custom.faction, tiers: cloneTiers(custom.tiers.slice(1)) });
  const fillFrom = (key: string) => {
    const from = pyramid?.presets.find((p) => p.key === key) ?? pyramid?.configs.find((c) => c.id === key);
    if (from && draft) setDraft({ ...draft, tiers: cloneTiers(from.tiers) });
  };
  const full = pyramid ? pyramid.configs.length >= pyramid.max_configs : false;

  if (!pyramid) return <div className="panel"><Loading label={t("pyramid.loading")} /></div>;

  const totalMissing = levels.reduce((n, l) => n + l.missing, 0);
  const done = levels.filter((l) => l.done).length;
  const picked = [...selected].sort((a, b) => a - b);
  const pickedMissing = levels.filter((l) => selected.has(l.index)).reduce((n, l) => n + l.missing, 0);

  return (
    <div className="tab-fade flex flex-col gap-4">
      <PageHeader
        icon="pyramid"
        eyebrow={t("pyramid.kicker")}
        title={t("pyramid.title")}
        lead={t("pyramid.hint")}
        actions={
          draft ? (
            <>
              <button type="button" className="btn h-10" onClick={() => setDraft(null)} disabled={busy}>{t("common.cancel")}</button>
              <button type="button" className="btn btn-primary h-10" disabled={busy || !draft.tiers.some((tier) => tier.items.length)} onClick={() => setNaming(true)}>
                <Icon name="check" size={16} />
                {t("common.save")}
              </button>
            </>
          ) : null
        }
      >
        <div className="divider" />

        <div className="flex flex-col gap-2">
          <span className="field-label">{t("pyramid.config")}</span>
          <div data-guide="pyramid-config" className="pyramid-configs" role="radiogroup" aria-label={t("pyramid.config")}>
            {pyramid.presets.map((p) => (
              <button key={p.key} type="button" role="radio" aria-checked={config === p.key} className={cn("pyramid-config", config === p.key && "is-active")} onClick={() => pickConfig(p.key)}>
                {t(presetLabel(p.key))}
              </button>
            ))}
            {pyramid.configs.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={config === CUSTOM_PREFIX + c.id} className={cn("pyramid-config is-own", config === CUSTOM_PREFIX + c.id && !draft && "is-active")} onClick={() => pickConfig(CUSTOM_PREFIX + c.id)}
                title={c.updated_by ? t("pyramid.ownBy", { name: c.updated_by }) : undefined}>
                {c.name}
              </button>
            ))}
            {canCreate ? (
              <button type="button" data-guide="pyramid-custom" className={cn("pyramid-config is-custom", draft && !draft.id && "is-active")} disabled={full || Boolean(draft)} onClick={startCustom}
                title={full ? t("pyramid.limitReached", { n: pyramid.max_configs }) : t("pyramid.customEditHint")}>
                <Icon name="plus" size={14} className="mr-1 inline" />
                {t("pyramid.custom")}
              </button>
            ) : null}
          </div>
          {custom && !draft && (canEdit || canDelete) ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-fg-3">{custom.name}{custom.updated_by ? ` · ${t("pyramid.ownBy", { name: custom.updated_by })}` : ""}</span>
              {canEdit ? (
                <button type="button" className="btn h-8 min-h-0 px-3 text-[0.8rem]" onClick={startEditOwn}>
                  <Icon name="edit" size={14} />
                  {t("pyramid.editConfig")}
                </button>
              ) : null}
              {canDelete ? (
                <button type="button" className={cn("btn btn-ghost h-8 min-h-0 px-3 text-[0.8rem] text-danger", armed === `del-${custom.id}` && "btn-danger")} disabled={busy}
                  onClick={() => confirm(`del-${custom.id}`, () => void removeConfig(custom.id))}>
                  <Icon name="trash" size={14} />
                  {armed === `del-${custom.id}` ? t("common.confirmQ") : t("pyramid.deleteConfig")}
                </button>
              ) : null}
            </div>
          ) : null}
          {full && canCreate && !draft ? <span className="text-xs text-fg-3">{t("pyramid.limitReached", { n: pyramid.max_configs })}</span> : null}
        </div>

        <div className="pyramid-controls">
          <div data-guide="pyramid-source" className="flex flex-col gap-1.5">
            <span className="field-label">{t("pyramid.source")}</span>
            <Segmented
              label={t("pyramid.source")}
              value={source}
              onChange={(k) => setSource(k)}
              options={[
                { value: "stockpile", label: t("pyramid.sourceStockpile") },
                { value: "bunker", label: t("pyramid.sourceBunker") },
              ]}
            />
          </div>

          <div data-guide="pyramid-unit" className="flex flex-col gap-1.5">
            <span className="field-label">{t("pyramid.stockUnit")}</span>
            <Segmented
              label={t("pyramid.stockUnit")}
              value={unit}
              onChange={(k) => {
                setUnits((u) => ({ ...u, [source]: k }));
                writeStorage(UNIT_KEY(source), k);
              }}
              options={[
                { value: "crate", label: t("pyramid.inCrates") },
                { value: "unit", label: t("pyramid.inUnits") },
              ]}
            />
          </div>

          <div data-guide="pyramid-faction" className="flex flex-col gap-1.5">
            <span className="field-label">{t("tools.faction")}</span>
            <Segmented
              label={t("tools.faction")}
              value={draft ? draft.faction : viewFaction}
              onChange={(k) => (draft ? setDraft({ ...draft, faction: k }) : setViewFaction(k))}
              options={FACTIONS.map((f) => ({ value: f.key, label: t(f.label) }))}
            />
          </div>
        </div>

        {source === "stockpile" ? (
          <label className="mt-4 flex max-w-xl flex-col gap-1.5">
            <span className="field-label">{t("pyramid.stockpile")}</span>
            <select data-guide="pyramid-stockpile" className="field h-11" value={stockpileId ?? ""} onChange={(e) => setStockpileId(e.target.value || null)}>
              {!stockpiles ? <option value="">{t("common.loading")}</option> : stockpiles.length === 0 ? <option value="">{t("pyramid.noStockpiles")}</option> : null}
              {(stockpiles ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.region} · {s.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <BunkerPanel bunker={bunker} onLoad={setBunker} />
        )}
        {preset && !draft ? <p className="mt-3 text-xs text-fg-3">{t("pyramid.presetHint")}</p> : null}
        {draft ? (
          <div className="pyramid-custom-bar">
            <span className="text-[0.85rem] text-fg">{t("pyramid.customHint")}</span>
            <select className="field h-9 py-1 text-xs" value="" onChange={(e) => e.target.value && fillFrom(e.target.value)} aria-label={t("pyramid.fillFrom")}>
              <option value="">{t("pyramid.fillFrom")}</option>
              {pyramid.presets.map((p) => (
                <option key={p.key} value={p.key}>{t(presetLabel(p.key))}</option>
              ))}
              {pyramid.configs.filter((c) => c.id !== draft.id).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        ) : null}
      </PageHeader>
      <NameConfigModal
        open={naming}
        initial={draft?.name ?? ""}
        busy={busy}
        onClose={() => setNaming(false)}
        onSave={(name) => void save(name)}
      />

      {!draft ? (
        <section data-guide="pyramid-now" className={cn("panel pyramid-now p-5", now < 0 && "is-done")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              {now < 0 ? (
                <div className="panel-title text-safe">{t("pyramid.allDone")}</div>
              ) : (
                <>
                  <div className="text-xs font-semibold text-warn">{t("pyramid.bringNow")}</div>
                  <div className="mt-1 text-[1.15rem] font-semibold tracking-[-0.015em]">
                    {t("pyramid.level", { n: now + 1 })}{levels[now].title ? ` • ${levels[now].title}` : ""} — {t("pyramid.missingCrates", { n: levels[now].missing })}
                  </div>
                </>
              )}
              <div className="mt-1 text-xs text-fg-3">{t("pyramid.progress", { done, total: levels.length, n: totalMissing })}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-fg-3">
                {picked.length ? t("pyramid.selectedLevels", { list: picked.map((i) => i + 1).join(", "), n: pickedMissing }) : t("pyramid.selectedNone")}
              </span>
              <button type="button" className="btn btn-primary" data-guide="pyramid-order" disabled={!picked.length} onClick={() => toConstructor(picked)}>
                {t("pyramid.toBuilderSelected")}
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

      <section data-guide="pyramid-tiers" className="panel p-5">
        <div className="pyramid">
          {/* уровень 1 — самое необходимое — сверху, дальше по убыванию */}
          {levels.map((level) => (
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
              faction={draft ? draft.faction : viewFaction}
            />
          ))}
        </div>
        {draft ? (
          <button type="button" className="btn mt-4 h-11 w-full border-dashed" onClick={() => editTiers((tiers) => [...tiers, { title: "", items: [] }])}>
            <Icon name="plus" size={16} />
            {t("pyramid.addTier")}
          </button>
        ) : null}
        <p className="mt-4 text-center text-xs text-fg-3">{t("pyramid.legend")}</p>
      </section>
    </div>
  );
};

/** «Назовите конфигурацию»: название увидят все участники клана в списке конфигураций. */
const NameConfigModal: React.FC<{ open: boolean; initial: string; busy: boolean; onClose: () => void; onSave: (name: string) => void }> = ({ open, initial, busy, onClose, onSave }) => {
  const { t } = useI18n();
  const [name, setName] = React.useState(initial);
  React.useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  const ok = name.trim().length > 0;
  return (
    <Modal open={open} onClose={onClose} title={t("pyramid.nameTitle")} icon="pyramid" widthClass="max-w-md">
      <div className="grid gap-3">
        <p className="text-[0.85rem] text-fg-2">{t("pyramid.nameHint")}</p>
        <input className="field h-11" autoFocus maxLength={40} value={name} placeholder={t("pyramid.namePlaceholder")}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ok && onSave(name)} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-primary" disabled={!ok || busy} onClick={() => onSave(name)}>{busy ? t("common.sending") : t("common.save")}</button>
        </div>
      </div>
    </Modal>
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
      <label className="flex max-w-xl flex-col gap-1.5">
        <span className="field-label">{t("pyramid.bunkerName")}</span>
        <input className="field h-11" value={name} placeholder={t("pyramid.bunkerNamePlaceholder")} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{bunker ? t("pyramid.bunkerReload") : t("pyramid.bunkerLoad")}</span>
        {bunker ? (
          <span className="badge badge-accent">{bunker.name} · {t("pyramid.bunkerLines", { n: bunker.lines.length })}</span>
        ) : null}
      </div>
      <div className="pyramid-import">
        <button type="button" className="pyramid-import-btn" disabled={busy} onClick={() => pick(textInput)}>
          <span className="icon-tile h-11 w-11"><UiGlyph icon="file-json" size={22} /></span>
          <span><b>JSON / TXT</b><small>{t("pyramid.importFile")}</small></span>
        </button>
        <button type="button" className="pyramid-import-btn" disabled={busy} onClick={() => pick(xlsxInput)}>
          <span className="icon-tile h-11 w-11"><UiGlyph icon="file-xlsx" size={22} /></span>
          <span><b>XLSX</b><small>{t("pyramid.importXlsx")}</small></span>
        </button>
        <button
          type="button"
          className="pyramid-import-btn"
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
          <span className="icon-tile h-11 w-11"><UiGlyph icon="clipboard" size={22} /></span>
          <span><b>{t("export.fmt.clipboard")}</b><small>{t("pyramid.importClipboard")}</small></span>
        </button>
      </div>

      <input ref={textInput} type="file" accept=".json,.txt,application/json,text/plain" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void file.text().then(importText);
      }} />
      <input ref={xlsxInput} type="file" accept=".xlsx" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void xlsxToText(file).then(importText).catch((err) => notify({ title: "XLSX", message: errorText(err, t("import.xlsxFailed")), tone: "danger" }));
      }} />
      <Modal open={pasteOpen} onClose={() => setPasteOpen(false)} title={t("pyramid.sourceBunker")} icon="clipboard" widthClass="max-w-lg">
        <p className="text-sm text-fg-2">{t("import.pasteHelp")}</p>
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
  const i = level.index;
  // основа — во всю ширину, каждый уровень выше — уже
  const width = count > 1 ? 100 - (i / (count - 1)) * 40 : 100;
  const options = React.useMemo(
    () =>
      [...catalog.values()]
        .filter((it) => (it.faction === "neutral" || it.faction === faction) && !NOT_IN_PYRAMID.has(it.category))
        .map((it) => ({ code: it.code, name: itemName(it, locale), icon: it.iconUrl, hay: itemSearchHay(it) })),
    [catalog, faction, locale],
  );
  // поиск по всем языкам, коду и сокращениям: «basic material», «бмат», «bmat»
  const matches = React.useMemo(
    () => (adding.trim() ? options.filter((o) => matchesWords(o.hay, adding)).slice(0, 8) : []),
    [options, adding],
  );
  const add = (code: string | undefined) => {
    if (!code) return;
    onEdit((tiers) => {
      if (!tiers[i].items.some((it) => it.code === code)) tiers[i].items.push({ code, crates: 1 });
      return tiers;
    });
    setAdding("");
  };

  return (
    <div className={cn("pyramid-tier", level.done ? "is-done" : current ? "is-current" : "", selected && !editing && "is-selected")} style={{ width: `${width}%` }}>
      <div className="pyramid-tier-head">
        {editing ? null : (
          <button type="button" className={cn("pyramid-pick", selected && "is-on")} aria-pressed={selected} onClick={onToggle} title={t("pyramid.selectForOrder")}>
            <span className="pyramid-pick-box" aria-hidden>{selected ? <Icon name="check" size={11} strokeWidth={3} /> : null}</span>
            <span>{t("pyramid.toOrder")}</span>
          </button>
        )}
        <span className="pyramid-tier-n">{t("pyramid.level", { n: i + 1 })}</span>
        {editing ? (
          <input className="field h-8 flex-1 py-1 text-xs" placeholder={t("pyramid.tierTitle")} value={level.title} maxLength={60}
            onChange={(e) => onEdit((tiers) => { tiers[i] = { ...tiers[i], title: e.target.value }; return tiers; })} />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[0.85rem] text-fg-2">{level.title || (i === 0 ? t("pyramid.base") : "")}</span>
        )}
        {editing ? (
          <span className="flex gap-1">
            <button type="button" className="btn btn-icon h-8 min-h-0 w-8" disabled={i === 0} title={t("pyramid.up")} aria-label={t("pyramid.up")} onClick={() => onEdit((tiers) => { [tiers[i], tiers[i - 1]] = [tiers[i - 1], tiers[i]]; return tiers; })}><Icon name="chevronDown" size={15} className="rotate-180" /></button>
            <button type="button" className="btn btn-icon h-8 min-h-0 w-8" disabled={i === count - 1} title={t("pyramid.down")} aria-label={t("pyramid.down")} onClick={() => onEdit((tiers) => { [tiers[i], tiers[i + 1]] = [tiers[i + 1], tiers[i]]; return tiers; })}><Icon name="chevronDown" size={15} /></button>
            <button type="button" className="row-remove h-8 w-8" disabled={count <= 1} title={t("pyramid.removeTier")} aria-label={t("pyramid.removeTier")}
              onClick={() => onEdit((tiers) => tiers.filter((_, n) => n !== i))}><Icon name="trash" size={15} /></button>
          </span>
        ) : (
          <span className={cn("pyramid-tier-state", level.done ? "text-safe" : current ? "text-warn" : "text-muted")}>
            {level.done ? t("pyramid.closed") : `−${level.missing} ${t("unit.crate")}`}
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
                    <span className="text-xs text-fg-3">{t("unit.crate")}</span>
                  </span>
                ) : (
                  <>
                    <span className="pyramid-cell-qty">{c.have} / {c.target} {t("unit.crate")}</span>
                    <span className="pyramid-bar"><span style={{ width: `${ratio * 100}%` }} /></span>
                  </>
                )}
              </span>
              {editing ? (
                <button type="button" className="row-remove h-7 w-7" aria-label={t("pyramid.removeItem")} onClick={() => onEdit((tiers) => { tiers[i].items = tiers[i].items.filter((it) => it.code !== c.code); return tiers; })}><Icon name="close" size={13} /></button>
              ) : null}
            </div>
          );
        })}
        {editing ? (
          <div className="pyramid-add">
            <input className="field h-9 flex-1 py-1 text-xs" placeholder={t("pyramid.addItem")} value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add(matches[0]?.code)} />
            {matches.length ? (
              <ul className="pyramid-add-list" role="listbox">
                {matches.map((o) => (
                  <li key={o.code}>
                    <button type="button" role="option" aria-selected={false} onClick={() => add(o.code)}>
                      <ItemIcon sources={[assetUrl(o.icon)]} size={24} label={o.name} />
                      <span className="truncate">{o.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};
