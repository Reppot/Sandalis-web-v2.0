"use client";

import * as React from "react";
import { HEX_H, HEX_W, hexLeft, hexTop, iconOf, markerFactor, visibleLabels, type WorldMap } from "@/features/planning/model/map";
import { DEFAULTS, FACTION_COLOR, type Snapshot, type StructureDef } from "@/features/planning/model/plan";
import type { MapKind } from "@/features/planning/model/map";
import { MapCanvas, type Editor } from "@/features/planning/ui/MapCanvas";
import { PlanLayer } from "@/features/planning/ui/PlanLayer";
import { REPORT_STATUS_LABEL, type Report } from "@/entities/report";
import { Icon, Modal, assetUrl, errorText, formatDateTime, useNotify, useT, type MessageKey } from "@/shared";

const noop = () => undefined;
const NOTHING_HIDDEN = new Set<MapKind>();
const TEAM_FILL = { wardens: FACTION_COLOR.wardens, colonials: FACTION_COLOR.colonials, neutral: "#5b5b5b" } as const;

/**
 * «Интерактивный скрин» операции: вырезанный кусок карты с планом на момент снимка.
 * Его можно приближать и двигать, наводить на постройки и метки; скачать как PNG.
 */
export const SnapshotViewer: React.FC<{
  snapshot: Snapshot | null;
  onClose: () => void;
  structures: Map<string, StructureDef>;
  orders: Report[];
}> = ({ snapshot, onClose, structures, orders }) => {
  const t = useT();
  const notify = useNotify();
  const exportBox = React.useRef<HTMLDivElement>(null);
  const [busy, setBusy] = React.useState(false);

  const data = React.useMemo<WorldMap | null>(
    () =>
      snapshot
        ? { war_number: snapshot.war, phase: snapshot.phase, winner: null, updated_at: snapshot.created, next_update_at: snapshot.created, regions: snapshot.regions, source: "" }
        : null,
    [snapshot],
  );
  const editor = React.useMemo<Editor | null>(
    () =>
      snapshot
        ? { tool: "select", shapes: snapshot.shapes, selected: null, defaults: DEFAULTS, structures, orders, onSelect: noop, onAdd: noop, onUpdate: noop, onDelete: noop }
        : null,
    [snapshot, structures, orders],
  );
  const labels = React.useMemo(
    () => ({ arrow: (u: string) => t(`planning.unit.${u}` as MessageKey), status: (st: Report["status"] | null) => (st ? t(REPORT_STATUS_LABEL[st]) : t("planning.orderGone")) }),
    [t],
  );

  // масштаб картинки: ~2400 px по ширине, «экранный» масштаб — вдвое меньше (чёткость ×2)
  const k = snapshot ? Math.min(3, 2400 / snapshot.rect.w) : 1;
  const s = Math.min(1, k / 2); // не крупнее «приближения»: без мелких отметок и с читаемым текстом

  const download = async () => {
    if (!snapshot || !exportBox.current) return;
    setBusy(true);
    try {
      const blob = await renderPng(snapshot, k, s, exportBox.current.querySelector("svg"), t("planning.snapshotCaption", { name: snapshot.name, war: snapshot.war ?? "—", at: formatDateTime(snapshot.created) }));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${snapshot.name.replace(/[\\/:*?"<>|]+/g, "_") || "operation"}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (err) {
      notify({ title: t("planning.snapshotExportFailed"), message: errorText(err, t("planning.snapshotExportFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(snapshot)} onClose={onClose} title={snapshot?.name ?? ""} icon="map" widthClass="max-w-[min(1400px,96vw)]">
      {snapshot && data && editor ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg-3">
            <span>
              {formatDateTime(snapshot.created)}
              {snapshot.war ? ` · ${t("planning.snapshotWar", { war: snapshot.war })}` : ""} · {t("planning.objects", { n: snapshot.shapes.length })}
            </span>
            <button type="button" className="btn btn-primary h-9 min-h-0" disabled={busy} onClick={() => void download()}>
              <Icon name="download" size={15} />
              {t("planning.snapshotPng")}
            </button>
          </div>
          <div className="planning-snapshot-view">
            <MapCanvas data={data} hidden={NOTHING_HIDDEN} editor={editor} frame={snapshot.rect} />
          </div>
          <p className="text-xs text-fg-3">{t("planning.snapshotHint")}</p>
          {/* план в масштабе картинки — источник SVG для PNG */}
          <div ref={exportBox} aria-hidden style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
            <PlanLayer shapes={snapshot.shapes} draft={null} selected={null} scale={s} structures={structures} orders={orders} bounds={{ minX: snapshot.rect.x, minY: snapshot.rect.y, w: snapshot.rect.w, h: snapshot.rect.h }} labels={labels} />
          </div>
        </div>
      ) : null}
    </Modal>
  );
};

/* ───────────── PNG ───────────── */

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error(`image: ${src}`));
    img.src = src;
  });

const toDataUrl = async (url: string) => {
  const blob = await fetch(url).then((r) => r.blob());
  return new Promise<string>((ok) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result));
    fr.readAsDataURL(blob);
  });
};

/** Гексы, постройки войны, подписи городов и план — в одну картинку кадра. */
async function renderPng(snap: Snapshot, k: number, s: number, svg: SVGSVGElement | null | undefined, caption: string): Promise<Blob> {
  const { rect } = snap;
  const W = Math.round(rect.w * k), H = Math.round(rect.h * k);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#1f2b31";
  ctx.fillRect(0, 0, W, H);
  const px = k / s; // пикселей картинки на один «экранный» пиксель
  const at = (gx: number, gy: number) => [(gx - rect.x) * k, (gy - rect.y) * k] as const;

  for (const g of snap.regions) {
    const img = await loadImage(assetUrl(`/api/v1/assets/maps/hex/${g.slug}.webp`) ?? "");
    const [x, y] = at(hexLeft(g.col), hexTop(g.row));
    ctx.drawImage(img, x, y, HEX_W * k, HEX_H * k);
  }

  const f = markerFactor(s);
  if (snap.phase === "conquest") {
    for (const g of snap.regions) {
      for (const it of g.items) {
        const [x, y] = at(hexLeft(g.col) + it.x * HEX_W, hexTop(g.row) + it.y * HEX_H);
        const r = 13 * f * px;
        ctx.globalAlpha = it.scorched ? 0.45 : 1;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = TEAM_FILL[it.team];
        ctx.fill();
        ctx.lineWidth = 1.5 * f * px;
        ctx.strokeStyle = it.victory ? "#f5c84b" : "rgba(255,255,255,0.75)";
        ctx.stroke();
        const icon = await loadImage(assetUrl(iconOf(it)) ?? "");
        ctx.drawImage(icon, x - 9.5 * f * px, y - 9.5 * f * px, 19 * f * px, 19 * f * px);
        ctx.globalAlpha = 1;
      }
    }
  }

  // подписи городов — те же правила, что на карте
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const g of snap.regions) {
    for (const l of visibleLabels(g.labels, s)) {
      const [x, y] = at(hexLeft(g.col) + l.x * HEX_W, hexTop(g.row) + l.y * HEX_H);
      const size = (l.major ? 11.5 : 10) * px;
      ctx.font = `${l.major ? 600 : 500} ${size}px system-ui, sans-serif`;
      const w = ctx.measureText(l.text).width + 12 * px, h = size * 1.45;
      const top = l.major ? y + 3 * px : y - h / 2;
      ctx.fillStyle = l.major ? "rgba(17,20,24,0.72)" : "rgba(17,20,24,0.5)";
      ctx.beginPath();
      ctx.roundRect(x - w / 2, top, w, h, 6 * px);
      ctx.fill();
      ctx.fillStyle = l.major ? "#f4efe2" : "#e4ded0";
      ctx.fillText(l.text, x, top + (h - size) / 2);
    }
  }

  // план: SVG с картинками построек, встроенными как data: (иначе браузер их не нарисует)
  if (svg) {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(W));
    clone.setAttribute("height", String(H));
    clone.removeAttribute("style");
    for (const im of Array.from(clone.querySelectorAll("image"))) {
      const href = im.getAttribute("href");
      if (href && !href.startsWith("data:")) im.setAttribute("href", await toDataUrl(href));
    }
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    ctx.drawImage(await loadImage(url), 0, 0, W, H);
  }

  // подпись кадра
  const fs = 13 * px;
  ctx.font = `600 ${fs}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const cw = ctx.measureText(caption).width + 20 * px;
  ctx.fillStyle = "rgba(10,12,14,0.78)";
  ctx.beginPath();
  ctx.roundRect(10 * px, H - 38 * px, cw, 28 * px, 8 * px);
  ctx.fill();
  ctx.fillStyle = "#f4f4f5";
  ctx.fillText(caption, 20 * px, H - 24 * px);

  return new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("canvas"))), "image/png"));
}
