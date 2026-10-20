"use client";

import * as React from "react";
import { EmptyState, Loading, Modal, UiGlyph, apiClient, assetUrl, cn, useI18n, type Locale, type UiIcon } from "@/shared";

type L = Record<Locale, string>;

interface GuideMarker {
  /** Центр метки в процентах ширины/высоты скриншота. */
  x: number;
  y: number;
}

interface GuideShot {
  id: string;
  caption: L;
  images: Record<Locale, string>;
  size: Record<Locale, { w: number; h: number }>;
  markers: Record<Locale, GuideMarker[]>;
  /** notes[locale][i] — пояснение к метке №(i+1). */
  notes: Record<Locale, string[]>;
}

interface GuideChapter {
  icon: UiIcon;
  title: L;
  summary: L;
  shots: GuideShot[];
}

interface GuideEntry {
  key: string;
  sort: number;
  payload: GuideChapter;
}

const pick = (value: L | undefined, locale: Locale) => value?.[locale] ?? value?.ru ?? "";

/**
 * «Навигация»: руководство по терминалу. Главы, скриншоты (на языке интерфейса),
 * координаты меток и пояснения — из БД (app_content kind=guide_chapter), их
 * генерирует backend/scripts/guide по живому интерфейсу.
 */
export const GuideWorkspace: React.FC = () => {
  const { t, locale } = useI18n();
  const [chapters, setChapters] = React.useState<GuideEntry[] | null>(null);
  const [active, setActive] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState<GuideShot | null>(null);

  React.useEffect(() => {
    apiClient
      .get<GuideEntry[]>("/api/v1/content", { params: { kind: "guide_chapter" } })
      .then((rows) => {
        const sorted = [...rows].sort((a, b) => a.sort - b.sort);
        setChapters(sorted);
        setActive((prev) => prev ?? sorted[0]?.key ?? null);
      })
      .catch(() => setChapters([]));
  }, []);

  const chapter = chapters?.find((c) => c.key === active)?.payload ?? null;
  const index = chapters?.findIndex((c) => c.key === active) ?? -1;

  const go = (key: string) => {
    setActive(key);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="tab-fade flex flex-col gap-3">
      <section className="panel panel-corners rounded-md p-4">
        <div className="flex items-center gap-3">
          <UiGlyph icon="guide" size={40} />
          <div className="min-w-0">
            <div className="hud-label text-muted">{t("guide.kicker")}</div>
            <h1 className="panel-title mt-1 text-[1rem] md:text-[1.2rem]">{t("nav.guide.label")}</h1>
            <p className="mt-1 text-[0.8rem] text-white/70">{t("guide.subtitle")}</p>
          </div>
        </div>
      </section>

      {!chapters ? (
        <div className="panel rounded-md"><Loading /></div>
      ) : chapters.length === 0 ? (
        <div className="panel rounded-md"><EmptyState icon="guide" title={t("guide.empty")} /></div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-3 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <nav className="panel panel-corners guide-toc min-w-0 rounded-md p-2.5" aria-label={t("guide.toc")}>
            <div className="hud-label px-1.5 pb-2 text-accent">{t("guide.toc")}</div>
            <ol className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
              {chapters.map((c, i) => (
                <li key={c.key} className="shrink-0">
                  <button type="button" className={cn("guide-toc-item", c.key === active && "is-active")} onClick={() => go(c.key)} aria-current={c.key === active ? "page" : undefined}>
                    <span className="guide-toc-num">{i + 1}</span>
                    <UiGlyph icon={c.payload.icon} size={20} />
                    <span className="truncate">{pick(c.payload.title, locale)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          {chapter && (
            <article className="flex min-w-0 flex-col gap-3">
              <header className="panel panel-corners rounded-md p-4">
                <div className="hud-label text-muted">{t("guide.chapter", { n: index + 1, total: chapters.length })}</div>
                <h2 className="panel-title mt-1 flex items-center gap-2 text-[1.05rem]">
                  <UiGlyph icon={chapter.icon} size={26} /> {pick(chapter.title, locale)}
                </h2>
                <p className="mt-2 text-[0.85rem] leading-relaxed text-white/80">{pick(chapter.summary, locale)}</p>
              </header>

              {chapter.shots.map((shot) => (
                <GuideFigure key={shot.id} shot={shot} locale={locale} onZoom={() => setZoom(shot)} zoomLabel={t("guide.zoom")} />
              ))}

              <div className="flex justify-between gap-2">
                <button type="button" className="btn" disabled={index <= 0} onClick={() => go(chapters[index - 1].key)}>← {t("guide.prev")}</button>
                <button type="button" className="btn btn-primary" disabled={index >= chapters.length - 1} onClick={() => go(chapters[index + 1].key)}>{t("guide.next")} →</button>
              </div>
            </article>
          )}
        </div>
      )}

      <Modal open={Boolean(zoom)} onClose={() => setZoom(null)} title={zoom ? pick(zoom.caption, locale) : ""} icon="guide" widthClass="max-w-[min(1500px,96vw)]">
        {zoom && <ShotImage shot={zoom} locale={locale} />}
      </Modal>
    </div>
  );
};

const ShotImage: React.FC<{ shot: GuideShot; locale: Locale; active?: number | null; onMarker?: (i: number) => void }> = ({ shot, locale, active, onMarker }) => {
  const markers = shot.markers[locale] ?? shot.markers.ru ?? [];
  const src = assetUrl(shot.images[locale] ?? shot.images.ru) ?? "";
  const size = shot.size[locale] ?? shot.size.ru;
  return (
    // высокие снимки (экран входа, модальные окна) целиком помещаются по высоте экрана
    <div className="guide-shot" style={{ aspectRatio: `${size.w} / ${size.h}`, width: `min(100%, calc(78dvh * ${size.w / size.h}))` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={pick(shot.caption, locale)} width={size.w} height={size.h} />
      {markers.map((m, i) => (
        <button
          key={i}
          type="button"
          className={cn("guide-marker", active === i && "is-active")}
          style={{ left: `${m.x}%`, top: `${m.y}%` }}
          onClick={(e) => {
            e.stopPropagation();
            onMarker?.(i);
          }}
          onMouseEnter={() => onMarker?.(i)}
          aria-label={`${i + 1}`}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
};

const GuideFigure: React.FC<{ shot: GuideShot; locale: Locale; onZoom: () => void; zoomLabel: string }> = ({ shot, locale, onZoom, zoomLabel }) => {
  const [active, setActive] = React.useState<number | null>(null);
  const notes = shot.notes[locale] ?? shot.notes.ru ?? [];
  return (
    <figure className="panel panel-corners rounded-md p-3 md:p-4">
      <figcaption className="mb-3 flex items-center justify-between gap-2">
        <span className="panel-title text-[0.85rem]">{pick(shot.caption, locale)}</span>
        <button type="button" className="btn px-2 py-1 text-[0.65rem]" onClick={onZoom}>⤢ {zoomLabel}</button>
      </figcaption>
      <ShotImage shot={shot} locale={locale} active={active} onMarker={setActive} />
      <ol className="guide-notes mt-3">
        {notes.map((note, i) => (
          <li key={i} className={cn(active === i && "is-active")} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
            <span className="guide-marker guide-marker-static">{i + 1}</span>
            <span>{note}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
};
