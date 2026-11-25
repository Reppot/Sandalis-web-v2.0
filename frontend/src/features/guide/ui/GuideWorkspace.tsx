"use client";

import * as React from "react";
import Link from "next/link";
import { EmptyState, Loading, Modal, UiGlyph, apiClient, assetUrl, cn, useI18n, type Locale, type UiIcon, Icon, PageHeader } from "@/shared";

type L = Partial<Record<Locale, string>>;

interface GuideShot {
  id: string;
  caption: L;
  images: Partial<Record<Locale, string>>;
  size: Partial<Record<Locale, { w: number; h: number }>>;
  /** Notes are shown beside the clean screenshot; they are not positioned over controls. */
  notes: Partial<Record<Locale, string[]>>;
}

interface GuideChapter {
  icon: UiIcon;
  title: L;
  summary: L;
  shots: GuideShot[];
  steps?: Array<{ title: L; body: L }>;
}

interface GuideEntry {
  key: string;
  sort: number;
  payload: GuideChapter;
}

/** Скриншоты сняты на ru/en; остальные локали используют английский кадр и текст. */
const shotLocale = (shot: GuideShot, locale: Locale): Locale => (shot.images[locale] ? locale : shot.images.en ? "en" : "ru");
const pick = (value: L | undefined, locale: Locale) => value?.[locale] ?? (locale === "ru" ? "" : value?.en) ?? value?.ru ?? "";
const guideSection = (key: string) => {
  if (["start", "layout", "menu"].includes(key)) return "basics";
  if (["orders", "pyramid", "codes", "tools", "calculators", "planning"].includes(key)) return "tools";
  if (["reports", "timers", "statistics", "operations", "training", "management"].includes(key)) return "clan";
  if (["feedback", "mail", "support"].includes(key)) return "site";
  return "account";
};
const sectionLabel = (section: string, locale: Locale) => ({
  basics: locale === "ru" ? "Основы" : "Basics",
  tools: locale === "ru" ? "Инструменты" : "Tools",
  clan: locale === "ru" ? "Работа клана" : "Clan workspace",
  site: locale === "ru" ? "Связь и помощь" : "Help and contact",
  account: locale === "ru" ? "Профиль и настройки" : "Profile and settings",
}[section] ?? section);

const GUIDE_ORDER = ["start", "layout", "tools", "orders", "pyramid", "planning", "codes", "calculators", "reports", "timers", "statistics", "operations", "training", "management", "feedback", "mail", "support", "cabinet"];
const guideRank = (key: string) => {
  const rank = GUIDE_ORDER.indexOf(key);
  return rank < 0 ? GUIDE_ORDER.length : rank;
};

const GUIDE_LINKS: Record<string, string> = {
  layout: "/?tab=tools",
  menu: "/?tab=tools",
  orders: "/?tab=tools&tool=orders",
  pyramid: "/?tab=tools&tool=pyramid",
  codes: "/?tab=tools&tool=codes",
  tools: "/?tab=tools",
  calculators: "/?tab=tools&tool=facility",
  planning: "/?tab=tools&tool=planning",
  reports: "/?tab=clan&view=reports",
  timers: "/?tab=clan&view=stockpiles",
  statistics: "/?tab=clan&view=stats",
  operations: "/?tab=clan&view=operations",
  training: "/?tab=clan&view=training",
  management: "/?tab=clan&view=management",
  feedback: "/?tab=feedback",
  mail: "/?tab=mail",
  support: "/?tab=support",
  cabinet: "/?tab=cabinet",
};

const planningGuide: GuideEntry = {
  key: "planning",
  sort: 7,
  payload: {
    icon: "map",
    title: { ru: "Планирование операций", en: "Operation planning" },
    summary: {
      ru: "Карта открывается обзором без маркеров построек. Выберите нужные регионы, чтобы загрузить детали и редактировать план.",
      en: "The map opens as an overview without building markers. Select the regions you need to load details and edit your plan.",
    },
    shots: [],
    steps: [
      {
        title: { ru: "Выберите регионы", en: "Select regions" },
        body: { ru: "Нажмите «Регионы», отметьте один или несколько гексов на карте и нажмите «Готово». Выбранные гексы обведены границей.", en: "Click Regions, select one or more hexes on the map, then click Done. Selected hexes are outlined." },
      },
      {
        title: { ru: "Работайте с выбранными гексами", en: "Work with selected hexes" },
        body: { ru: "Данные построек загружаются только для выбранных регионов. Добавляйте маркеры, размещайте объекты и рисуйте линии в сгруппированной панели инструментов.", en: "Building data loads only for selected regions. Add markers, place objects, and draw lines from the grouped tools panel." },
      },
      {
        title: { ru: "Оцените линию фронта", en: "Review the frontline" },
        body: { ru: "Кнопка «Фронт» показывает расчётную линию по взаимному расположению ратуш Варденов и Колонистов.", en: "The Frontline control shows an estimated line based on the positions of Warden and Colonial town halls." },
      },
    ],
  },
};

/**
 * «Навигация»: руководство по терминалу. Главы, скриншоты (на языке интерфейса),
 * координаты меток и пояснения — из БД (app_content kind=guide_chapter), их
 * генерирует backend/scripts/guide по живому интерфейсу.
 */
export const GuideWorkspace: React.FC = () => {
  const { t, locale } = useI18n();
  const [chapters, setChapters] = React.useState<GuideEntry[] | null>(null);
  const [active, setActive] = React.useState<string | null>(null);
  const [shotIndex, setShotIndex] = React.useState(0);
  const [zoom, setZoom] = React.useState<GuideShot | null>(null);

  React.useEffect(() => {
    apiClient
      .get<GuideEntry[]>("/api/v1/content", { params: { kind: "guide_chapter" } })
      .then((rows) => {
        const currentRows = rows.filter((row) => GUIDE_ORDER.includes(row.key));
        const storedPlanning = currentRows.find((row) => row.key === planningGuide.key);
        const currentPlanning = storedPlanning
          ? { ...storedPlanning, payload: { ...storedPlanning.payload, ...planningGuide.payload, shots: storedPlanning.payload.shots } }
          : planningGuide;
        const sorted = [...currentRows.filter((row) => row.key !== planningGuide.key), currentPlanning].sort((a, b) => guideRank(a.key) - guideRank(b.key) || a.sort - b.sort);
        setChapters(sorted);
        setActive((prev) => prev ?? sorted[0]?.key ?? null);
      })
      .catch(() => {
        setChapters([planningGuide]);
        setActive((prev) => prev ?? planningGuide.key);
      });
  }, []);

  const chapter = chapters?.find((c) => c.key === active)?.payload ?? null;
  const activeShot = chapter?.shots[Math.min(shotIndex, Math.max(0, chapter.shots.length - 1))] ?? null;
  const index = chapters?.findIndex((c) => c.key === active) ?? -1;
  const guideGroups = React.useMemo(() => {
    const groups = new Map<string, GuideEntry[]>();
    for (const entry of chapters ?? []) {
      const key = guideSection(entry.key);
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return [...groups.entries()];
  }, [chapters]);

  const go = (key: string) => {
    setActive(key);
    setShotIndex(0);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="tab-fade flex flex-col gap-4">
      <PageHeader icon="guide" eyebrow={t("guide.kicker")} title={t("nav.guide.label")} lead={t("guide.subtitle")} />

      {!chapters ? (
        <div className="panel"><Loading /></div>
      ) : chapters.length === 0 ? (
        <div className="panel"><EmptyState icon="guide" title={t("guide.empty")} /></div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <nav className="panel guide-toc min-w-0 p-2.5" aria-label={t("guide.toc")}>
            <div className="guide-toc-mobile">
              <label htmlFor="guide-mobile-jump" className="mb-1 block px-1 text-xs font-semibold text-fg-3">{t("guide.toc")}</label>
              <select id="guide-mobile-jump" className="field h-10 w-full" value={active ?? ""} onChange={(event) => go(event.currentTarget.value)}>
                {guideGroups.map(([section, entries]) => (
                  <optgroup key={section} label={sectionLabel(section, locale)}>
                    {entries.map((entry) => <option key={entry.key} value={entry.key}>{pick(entry.payload.title, locale)}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <ol className="guide-toc-list">
              {chapters.map((c, i) => {
                const section = guideSection(c.key);
                const previousSection = i > 0 ? guideSection(chapters[i - 1].key) : null;
                return <React.Fragment key={c.key}>
                  {section !== previousSection ? <li className="guide-toc-section" aria-hidden="true">{sectionLabel(section, locale)}</li> : null}
                  <li className="shrink-0">
                    <button type="button" className={cn("guide-toc-item", c.key === active && "is-active")} onClick={() => go(c.key)} aria-current={c.key === active ? "page" : undefined}>
                      <span className="guide-toc-num">{String(i + 1).padStart(2, "0")}</span>
                      <UiGlyph icon={c.payload.icon} size={18} className="text-current" />
                      <span className="truncate">{pick(c.payload.title, locale)}</span>
                    </button>
                  </li>
                </React.Fragment>;
              })}
            </ol>
          </nav>

          {chapter && (
            <article className="flex min-w-0 flex-col gap-4">
              <header className="panel flex flex-wrap items-start justify-between gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="page-eyebrow">{t("guide.chapter", { n: index + 1, total: chapters.length })} · {sectionLabel(guideSection(active ?? ""), locale)}</div>
                  <h2 className="mt-1.5 flex items-center gap-2.5 text-[1.35rem] font-semibold tracking-[-0.02em]">
                    <UiGlyph icon={chapter.icon} size={24} /> {pick(chapter.title, locale)}
                  </h2>
                  <p className="mt-2 max-w-3xl text-[0.95rem] leading-relaxed text-fg-2">{pick(chapter.summary, locale)}</p>
                </div>
                {active && GUIDE_LINKS[active] && !chapter.steps ? (
                  <Link className="btn btn-primary shrink-0" href={GUIDE_LINKS[active]}>
                    {locale === "ru" ? "Открыть раздел" : "Open section"}
                  </Link>
                ) : null}
              </header>

              {chapter.steps?.length ? (
                <section className="panel p-5" aria-label={locale === "ru" ? "Как пользоваться планированием" : "How to use planning"}>
                  <h3 className="text-base font-semibold">{locale === "ru" ? "Рабочий порядок" : "Workflow"}</h3>
                  <ol className="guide-steps mt-4">
                    {chapter.steps.map((step, i) => (
                      <li key={i}>
                        <span className="guide-step-index" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                        <div>
                          <h4 className="font-semibold">{pick(step.title, locale)}</h4>
                          <p className="mt-1 text-sm leading-relaxed text-fg-2">{pick(step.body, locale)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <Link className="btn btn-primary btn-lg mt-5" href="/?tab=tools&tool=planning">
                    <UiGlyph icon="map" size={16} />{locale === "ru" ? "Открыть планирование" : "Open planning"}
                  </Link>
                </section>
              ) : null}

              {activeShot ? (
                <GuideFigure
                  key={activeShot.id}
                  shot={activeShot}
                  locale={locale}
                  onZoom={() => setZoom(activeShot)}
                  zoomLabel={t("guide.zoom")}
                  shotIndex={Math.min(shotIndex, chapter.shots.length - 1)}
                  shotCount={chapter.shots.length}
                  onPrevious={() => setShotIndex((current) => Math.max(0, current - 1))}
                  onNext={() => setShotIndex((current) => Math.min(chapter.shots.length - 1, current + 1))}
                />
              ) : null}

              <div className="flex justify-between gap-2">
                <button type="button" className="btn btn-lg" disabled={index <= 0} onClick={() => go(chapters[index - 1].key)}><Icon name="chevronLeft" size={16} />{t("guide.prev")}</button>
                <button type="button" className="btn btn-primary btn-lg" disabled={index >= chapters.length - 1} onClick={() => go(chapters[index + 1].key)}>{t("guide.next")}<Icon name="chevronRight" size={16} /></button>
              </div>
            </article>
          )}
        </div>
      )}

      <Modal open={Boolean(zoom)} onClose={() => setZoom(null)} title={zoom ? pick(zoom.caption, locale) : ""} icon="guide" widthClass="max-w-[min(1500px,96vw)]">
        {zoom && <ShotImage shot={zoom} locale={locale} zoomed />}
      </Modal>
    </div>
  );
};

const ShotImage: React.FC<{ shot: GuideShot; locale: Locale; zoomed?: boolean }> = ({ shot, locale, zoomed = false }) => {
  const at = shotLocale(shot, locale);
  const src = assetUrl(shot.images[at]) ?? "";
  const size = shot.size[at] ?? { w: 1440, h: 900 };
  return (
    <div className={cn("guide-shot", zoomed && "is-zoomed")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={pick(shot.caption, locale)} width={size.w} height={size.h} />
    </div>
  );
};

const GuideFigure: React.FC<{
  shot: GuideShot;
  locale: Locale;
  onZoom: () => void;
  zoomLabel: string;
  shotIndex: number;
  shotCount: number;
  onPrevious: () => void;
  onNext: () => void;
}> = ({ shot, locale, onZoom, zoomLabel, shotIndex, shotCount, onPrevious, onNext }) => {
  const notes = shot.notes[locale] ?? (locale === "ru" ? undefined : shot.notes.en) ?? shot.notes.ru ?? [];
  return (
    <figure className="panel p-4 md:p-5">
      <figcaption className="mb-4 flex items-center justify-between gap-2">
        <span className="panel-title min-w-0 flex-1">{pick(shot.caption, locale)}</span>
        <div className="flex shrink-0 items-center gap-2">
          {shotCount > 1 ? (
            <div className="guide-shot-pagination" role="group" aria-label={locale === "ru" ? "Кадры главы" : "Chapter screenshots"}>
              <button type="button" className="btn h-8 min-h-0 px-2" onClick={onPrevious} disabled={shotIndex <= 0} data-guide-prev-shot aria-label={locale === "ru" ? "Предыдущий экран" : "Previous screen"}>
                <Icon name="chevronLeft" size={14} />
              </button>
              <span className="guide-shot-count" data-guide-shot-index aria-live="polite">
                {locale === "ru" ? "Экран" : "Screen"} {shotIndex + 1} / {shotCount}
              </span>
              <button type="button" className="btn h-8 min-h-0 px-2" onClick={onNext} disabled={shotIndex >= shotCount - 1} data-guide-next-shot aria-label={locale === "ru" ? "Следующий экран" : "Next screen"}>
                <Icon name="chevronRight" size={14} />
              </button>
            </div>
          ) : null}
          <button type="button" className="btn h-8 min-h-0 px-3 text-[0.8rem]" onClick={onZoom} data-guide-zoom><Icon name="eye" size={14} />{zoomLabel}</button>
        </div>
      </figcaption>
      <div className="guide-figure-layout">
        <ShotImage shot={shot} locale={locale} />
        {notes.length > 0 ? (
          <aside className="guide-note-panel" aria-label={locale === "ru" ? "Пояснения к экрану" : "Screen notes"}>
            <h3 className="guide-note-heading">{locale === "ru" ? "Что здесь можно сделать" : "What you can do here"}</h3>
            <ul className="guide-notes">
              {notes.map((note, i) => <li className="guide-note" key={i}>{note}</li>)}
            </ul>
          </aside>
        ) : null}
      </div>
    </figure>
  );
};
