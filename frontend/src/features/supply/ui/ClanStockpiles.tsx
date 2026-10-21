"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { Scopes, type Can } from "@/entities/session";
import { stockpileApi, type Stockpile, type StockpileKind } from "@/entities/stockpile";
import { RegionTownFields } from "@/entities/world";
import { EmptyState, Field, Loading, Modal, copyText, errorText, formatDateTime, useI18n, useNotify, type MessageKey } from "@/shared";

const KINDS: { key: StockpileKind; label: MessageKey; icon: string }[] = [
  { key: "seaport", label: "stock.kind.seaport", icon: "⚓" },
  { key: "depot", label: "stock.kind.depot", icon: "📦" },
  { key: "other", label: "stock.kind.other", icon: "🏚" },
];
const kindOf = (k: StockpileKind | null) => KINDS.find((x) => x.key === k);

/** «Склады клана»: описание каждого склада — гекс, город, тип постройки, пароль. */
export const ClanStockpiles: React.FC<{ can: Can }> = ({ can }) => {
  const { t } = useI18n();
  const notify = useNotify();
  const [stockpiles, setStockpiles] = React.useState<Stockpile[] | null>(null);
  const [editing, setEditing] = React.useState<Stockpile | "new" | null>(null);
  const [shown, setShown] = React.useState<Set<string>>(new Set());

  const load = React.useCallback(() => {
    stockpileApi.list().then(setStockpiles).catch((err) => notify({ title: t("clan.stockpilesTitle"), message: errorText(err, t("stock.loadFailed")), tone: "danger" }));
  }, [notify, t]);
  React.useEffect(load, [load]);

  const canEdit = can(Scopes.STOCKPILES_EDIT);
  const canCreate = can(Scopes.STOCKPILES_CREATE);

  return (
    <section data-guide="clan-stockpiles" className="panel panel-corners rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="panel-title">🏬 {t("clan.stockpilesTitle")}{stockpiles ? ` • ${stockpiles.length}` : ""}</h2>
        {canCreate ? <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>＋ {t("stock.newClan")}</button> : null}
      </div>
      <p className="mt-1 text-[0.8rem] text-white/65">{t("clan.stockpilesHint")}</p>

      {!stockpiles ? (
        <Loading />
      ) : stockpiles.length === 0 ? (
        <EmptyState icon="stockpile" title={t("clan.noStockpiles")} />
      ) : (
        <div className="clan-stockpiles">
          {stockpiles.map((s) => {
            const kind = kindOf(s.kind);
            const open = shown.has(s.id);
            return (
              <article key={s.id} className="clan-stockpile">
                <div className="flex items-start gap-3">
                  <span className="clan-stockpile-kind" title={kind ? t(kind.label) : undefined}>{kind?.icon ?? "🏬"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="clan-stockpile-name">{s.name}</div>
                    <div className="clan-stockpile-meta">
                      🗺 {s.region}{s.town ? ` • ${s.town}` : ""}{kind ? ` • ${t(kind.label)}` : ""}
                    </div>
                  </div>
                  {canEdit ? <button type="button" className="btn px-2 py-1" title={t("clan.editStockpile")} onClick={() => setEditing(s)}>✎</button> : null}
                </div>
                <div className="clan-stockpile-row">
                  <span className="hud-label text-muted">🔑 {t("stock.password")}</span>
                  {s.accessCode ? (
                    <span className="flex items-center gap-1">
                      <code className="clan-stockpile-code">{open ? s.accessCode : "•".repeat(Math.min(8, s.accessCode.length))}</code>
                      <button type="button" className="btn px-1.5 py-0.5" title={open ? t("stock.hide") : t("stock.show")}
                        onClick={() => setShown((prev) => { const next = new Set(prev); if (open) next.delete(s.id); else next.add(s.id); return next; })}>
                        {open ? "🙈" : "👁"}
                      </button>
                      <button type="button" className="btn px-1.5 py-0.5" title={t("common.copy")}
                        onClick={() => void copyText(s.accessCode!).then((ok) => ok && notify({ title: s.name, message: t("stock.passwordCopied"), tone: "success" }))}>⧉</button>
                    </span>
                  ) : (
                    <span className="hud-label text-muted">—</span>
                  )}
                </div>
                <div className="clan-stockpile-row">
                  <span className="hud-label text-muted">📦 {t("clan.stockpileContents")}</span>
                  <span className="hud-label">{t("clan.stockpileLines", { n: s.itemsCount })}{s.lastSyncAt ? ` • ${formatDateTime(new Date(s.lastSyncAt))}` : ""}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <StockpileModal
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setStockpiles((prev) => (prev ? (prev.some((p) => p.id === saved.id) ? prev.map((p) => (p.id === saved.id ? { ...p, ...saved, items: p.items, itemsCount: p.itemsCount } : p)) : [...prev, saved]) : [saved]));
        }}
      />
    </section>
  );
};

const StockpileModal: React.FC<{ target: Stockpile | "new" | null; onClose: () => void; onSaved: (s: Stockpile) => void }> = ({ target, onClose, onSaved }) => {
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
      onSaved(r.stockpile);
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
