"use client";

import * as React from "react";
import { Icon, Modal, cn, useT } from "@/shared";
import type { Block, Course, Run } from "@/features/training/model/course";

/** Текст с жирным/подчёркнутым/курсивом и ссылками. */
export const Runs: React.FC<{ runs: Run[] }> = ({ runs }) => (
  <>
    {runs.map(([text, flags, href], i) => {
      const parts = text.split("\n");
      const content = parts.map((p, j) => (
        <React.Fragment key={j}>
          {j ? <br /> : null}
          {p}
        </React.Fragment>
      ));
      const cls = cn(flags.includes("b") && "font-semibold text-fg", flags.includes("u") && "course-u", flags.includes("i") && "italic");
      // ссылка на раздел самого сайта открывается здесь же, внешние — в новой вкладке
      if (href?.startsWith("/")) return <a key={i} href={href} className={cn("course-link", cls)}>{content}</a>;
      if (href) return <a key={i} href={href} target="_blank" rel="noreferrer noopener" className={cn("course-link", cls)}>{content}</a>;
      return cls ? <span key={i} className={cls}>{content}</span> : <React.Fragment key={i}>{content}</React.Fragment>;
    })}
  </>
);

type Zoom = (src: string, alt: string) => void;

const Img: React.FC<{ src: string; w: number; h: number; alt?: string; onZoom: Zoom }> = ({ src, w, h, alt, onZoom }) => (
  <button type="button" className="course-img" onClick={() => onZoom(src, alt ?? "")} style={w ? { width: Math.max(w, 160) } : undefined}>
    {/* eslint-disable-next-line @next/next/no-img-element -- картинки курса уже сжаты в WebP */}
    <img src={src} alt={alt ?? ""} width={w || undefined} height={h || undefined} loading="lazy" />
    <span className="course-img-zoom" aria-hidden><Icon name="search" size={14} /></span>
  </button>
);

/** Блоки страницы курса: соседние пункты списка собираются в один список. */
export const Blocks: React.FC<{ blocks: Block[]; onZoom: Zoom }> = ({ blocks, onZoom }) => {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.t === "li") {
      const items: Extract<Block, { t: "li" }>[] = [];
      while (i < blocks.length && blocks[i].t === "li") items.push(blocks[i++] as Extract<Block, { t: "li" }>);
      i--;
      out.push(
        <ul key={i} className="course-list">
          {items.map((li, j) => (
            <li key={j} className={cn(li.o && "is-ordered")} style={{ marginLeft: `${li.lvl * 1.25}rem` }} data-n={li.o ? items.slice(0, j + 1).filter((x) => x.o && x.lvl === li.lvl).length : undefined}>
              <Runs runs={li.r} />
            </li>
          ))}
        </ul>,
      );
    } else if (b.t === "p") out.push(<p key={i} className="course-p"><Runs runs={b.r} /></p>);
    else if (b.t === "h") out.push(<h4 key={i} className="course-h"><Runs runs={b.r} /></h4>);
    else if (b.t === "img") out.push(<figure key={i} className="course-figure"><Img {...b} onZoom={onZoom} /></figure>);
    else if (b.t === "gallery") out.push(<figure key={i} className="course-gallery">{b.imgs.map((im, j) => <Img key={j} {...im} onZoom={onZoom} />)}</figure>);
    else if (b.t === "cols") out.push(<div key={i} className="course-cols">{b.cols.map((c, j) => <div key={j} className="min-w-0"><Blocks blocks={c} onZoom={onZoom} /></div>)}</div>);
  }
  return <>{out}</>;
};

/**
 * Читалка курса: слева оглавление (темы → подтемы), справа страница подтемы с картинками
 * и кнопками «Назад/Далее». На телефоне оглавление — выпадающий список над страницей.
 */
export const CourseReader: React.FC<{ course: Course; onBack: () => void; header?: React.ReactNode; note?: React.ReactNode }> = ({ course, onBack, header, note }) => {
  const t = useT();
  const pages = React.useMemo(
    () => course.sections.flatMap((s, si) => s.topics.map((tp, ti) => ({ si, ti, section: s.title, topic: tp }))),
    [course],
  );
  const [page, setPage] = React.useState(0);
  const [zoom, setZoom] = React.useState<{ src: string; alt: string } | null>(null);
  const top = React.useRef<HTMLDivElement>(null);
  const current = pages[Math.min(page, pages.length - 1)];

  const go = (n: number) => {
    setPage(Math.max(0, Math.min(pages.length - 1, n)));
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const onZoom = React.useCallback<Zoom>((src, alt) => setZoom({ src, alt }), []);
  // активный пункт оглавления всегда виден (оглавление прокручивается отдельно)
  React.useEffect(() => {
    const item = top.current?.querySelector<HTMLElement>(".course-toc-item.is-active");
    if (item?.offsetParent) item.scrollIntoView({ block: "nearest" });
  }, [page]);
  // курс открывается с начала, а не с того места, где была карточка
  React.useEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
  }, [course]);

  if (!current) return null;
  const pageTitle = current.topic.title || current.section || course.title;

  return (
    <div ref={top} className="tab-fade flex scroll-mt-24 flex-col gap-4">
      <section className="panel course-head">
        <button type="button" className="btn btn-ghost h-9 min-h-0 px-3 text-sm" onClick={onBack}>
          <Icon name="chevronLeft" size={16} />
          {t("training.back")}
        </button>
        <div className="min-w-0">
          <h1 className="course-head-title">{course.title}</h1>
          {course.summary ? <p className="mt-1 text-sm text-fg-2">{course.summary}</p> : null}
          {header}
        </div>
      </section>
      {note}

      <div className="course-layout">
        <nav className="panel course-toc" aria-label={t("training.contents")}>
          <div className="course-toc-title">{t("training.contents")}</div>
          {course.sections.map((s, si) => (
            <div key={si} className="course-toc-section">
              {s.title ? <div className="course-toc-sec">{s.title}</div> : null}
              {s.topics.map((tp, ti) => {
                const idx = pages.findIndex((p) => p.si === si && p.ti === ti);
                return (
                  <button key={ti} type="button" className={cn("course-toc-item", idx === page && "is-active")} onClick={() => go(idx)} aria-current={idx === page ? "page" : undefined}>
                    {tp.title || s.title || course.title}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <label className="course-toc-mobile">
          <span className="field-label">{t("training.contents")}</span>
          <select className="field" value={page} onChange={(e) => go(Number(e.target.value))}>
            {pages.map((p, i) => (
              <option key={i} value={i}>{p.section && p.topic.title ? `${p.section} — ${p.topic.title}` : p.topic.title || p.section || course.title}</option>
            ))}
          </select>
        </label>

        <article className="panel course-page">
          {current.section && current.topic.title ? <div className="page-eyebrow">{current.section}</div> : null}
          <h2 className="course-page-title">{pageTitle}</h2>
          <div className="course-body">
            <Blocks blocks={current.topic.blocks} onZoom={onZoom} />
          </div>
          <div className="course-pager">
            <button type="button" className="btn" disabled={page === 0} onClick={() => go(page - 1)}>
              <Icon name="chevronLeft" size={16} />
              {t("guide.prev")}
            </button>
            <span className="text-xs text-fg-3 tabular">{page + 1} / {pages.length}</span>
            <button type="button" className="btn btn-primary" disabled={page >= pages.length - 1} onClick={() => go(page + 1)}>
              {t("guide.next")}
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
        </article>
      </div>

      <Modal open={Boolean(zoom)} onClose={() => setZoom(null)} title={zoom?.alt || pageTitle} icon="training" widthClass="max-w-[min(1400px,96vw)]">
        {zoom ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={zoom.src} alt={zoom.alt} className="mx-auto max-h-[80vh] w-auto rounded-[var(--radius)]" />
        ) : null}
      </Modal>
    </div>
  );
};
