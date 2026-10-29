"use client";

import * as React from "react";
import type { Snapshot, StructureDef } from "@/features/planning/model/plan";
import { PlanLayer } from "@/features/planning/ui/PlanLayer";
import { renderPng } from "@/features/planning/ui/SnapshotViewer";
import { REPORT_STATUS_LABEL, type Report } from "@/entities/report";
import { Loading, formatDateTime, useT, type MessageKey } from "@/shared";

/**
 * Снимок «Планирования» картинкой (PNG, как «Скачать PNG» в просмотре): для брифинга операции
 * и отправки в Discord. onBlob получает готовый PNG; клик — открыть интерактивный снимок.
 */
export const SnapshotImage: React.FC<{
  snapshot: Snapshot;
  structures: Map<string, StructureDef>;
  orders: Report[];
  /** Ширина картинки, px. */
  width?: number;
  onBlob?: (blob: Blob | null) => void;
  onOpen?: () => void;
}> = ({ snapshot, structures, orders, width = 1400, onBlob, onOpen }) => {
  const t = useT();
  const box = React.useRef<HTMLDivElement>(null);
  const [src, setSrc] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const blobCb = React.useRef(onBlob);
  blobCb.current = onBlob;

  const k = Math.min(1.5, width / snapshot.rect.w);
  const s = Math.min(1, k / 2);
  const labels = React.useMemo(
    () => ({ arrow: (u: string) => t(`planning.unit.${u}` as MessageKey), status: (st: Report["status"] | null) => (st ? t(REPORT_STATUS_LABEL[st]) : t("planning.orderGone")) }),
    [t],
  );

  React.useEffect(() => {
    let alive = true;
    let url: string | null = null;
    const caption = t("planning.snapshotCaption", { name: snapshot.name, war: snapshot.war ?? "—", at: formatDateTime(snapshot.created) });
    renderPng(snapshot, k, s, box.current?.querySelector("svg"), caption)
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
        setFailed(false);
        blobCb.current?.(blob);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        blobCb.current?.(null);
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [snapshot, structures, orders, k, s, t]);

  return (
    <figure className="ops-shot">
      {src ? (
        <button type="button" className="ops-shot-btn" onClick={onOpen} title={t("operations.openMap")}>
          <img src={src} alt={snapshot.name} />
        </button>
      ) : failed ? (
        <button type="button" className="ops-shot-btn ops-shot-empty" onClick={onOpen}>{t("planning.snapshotExportFailed")}</button>
      ) : (
        <div className="ops-shot-empty"><Loading /></div>
      )}
      <figcaption className="truncate text-xs text-fg-3">{snapshot.name}</figcaption>
      {/* план в масштабе картинки — источник SVG для PNG */}
      <div ref={box} aria-hidden style={{ display: "none" }}>
        <PlanLayer shapes={snapshot.shapes} draft={null} selected={null} scale={s} structures={structures} orders={orders}
          bounds={{ minX: snapshot.rect.x, minY: snapshot.rect.y, w: snapshot.rect.w, h: snapshot.rect.h }} labels={labels} />
      </div>
    </figure>
  );
};
