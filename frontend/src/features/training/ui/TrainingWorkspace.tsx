"use client";

import * as React from "react";
import { useSession } from "@/features/cabinet";
import { parseMarkup, topicCount, trainingApi, type ClanCourse, type ClanCourseList, type Course, type DevCourses } from "@/features/training/model/course";
import { ClanCourseEditor } from "@/features/training/ui/ClanCourseEditor";
import { Blocks, CourseReader } from "@/features/training/ui/CourseReader";
import { EmptyState, Icon, Loading, PageHeader, UiGlyph, cn, errorText, formatDateTime, readStorage, useConfirm, useI18n, useNotify, writeStorage, type UiIcon } from "@/shared";

type Tab = "dev" | "clan";
const TAB_KEY = "sindaris-training-tab";

/**
 * «Обучение»: две кнопки — «Курсы разработчика» (готовый базовый курс: логистика, пехота,
 * укрепления, танки) и «Курсы вашего клана» (пишут командир и офицеры с правом clan:content).
 */
export const TrainingWorkspace: React.FC = () => {
  const { t } = useI18n();
  const [tab, setTab] = React.useState<Tab>("dev");
  React.useEffect(() => setTab(readStorage<Tab>(TAB_KEY, "dev") === "clan" ? "clan" : "dev"), []);
  const pick = (next: Tab) => {
    setTab(next);
    writeStorage(TAB_KEY, next);
  };

  return (
    <div className="tab-fade flex flex-col gap-4">
      <PageHeader icon="training" eyebrow={t("training.kicker")} title={t("nav.training.label")} lead={t("training.lead")}>
        <div className="training-switch" role="tablist" aria-label={t("nav.training.label")}>
          <SwitchButton active={tab === "dev"} icon="guide" title={t("training.devTab")} hint={t("training.devTabHint")} onClick={() => pick("dev")} />
          <SwitchButton active={tab === "clan"} icon="training" title={t("training.clanTab")} hint={t("training.clanTabHint")} onClick={() => pick("clan")} />
        </div>
      </PageHeader>
      {tab === "dev" ? <DevCoursesView /> : <ClanCoursesView />}
    </div>
  );
};

const SwitchButton: React.FC<{ active: boolean; icon: UiIcon; title: string; hint: string; onClick: () => void }> = ({ active, icon, title, hint, onClick }) => (
  <button type="button" role="tab" aria-selected={active} className={cn("training-switch-btn", active && "is-active")} onClick={onClick}>
    <span className="training-switch-icon"><UiGlyph icon={icon} size={22} /></span>
    <span className="min-w-0 text-left">
      <span className="block font-semibold">{title}</span>
      <span className="mt-0.5 block text-xs text-fg-3">{hint}</span>
    </span>
  </button>
);

/* ───────────── курсы разработчика ───────────── */

const DevCoursesView: React.FC = () => {
  const { t, locale } = useI18n();
  const notify = useNotify();
  const [data, setData] = React.useState<DevCourses | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [open, setOpen] = React.useState<Course | null>(null);
  const [about, setAbout] = React.useState(false);

  React.useEffect(() => {
    trainingApi.devCourses().then(setData).catch((err) => {
      setFailed(true);
      notify({ title: t("training.loadFailed"), message: errorText(err, t("training.loadFailed")), tone: "danger" });
    });
  }, [notify, t]);

  if (failed) return <div className="panel"><EmptyState icon="training" title={t("training.loadFailed")} /></div>;
  if (!data) return <div className="panel"><Loading /></div>;

  const onlyRu = locale !== "ru" ? <div className="training-note"><Icon name="globe" size={16} />{t("training.onlyRu")}</div> : null;
  const byline = [data.release ? t("training.release", { date: data.release }) : "", ...data.credits].filter(Boolean);
  const credits = <p className="mt-2 text-xs text-fg-3">{byline.join(" · ")}</p>;

  if (open) {
    const header = <p className="mt-2 text-xs text-fg-3">{[data.title, ...byline].join(" · ")}</p>;
    return <CourseReader course={open} onBack={() => setOpen(null)} header={header} note={onlyRu} />;
  }

  return (
    <>
      {onlyRu}
      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="section-title">{data.title}</h2>
            {credits}
          </div>
          {data.about.length ? (
            <button type="button" className="btn h-9 min-h-0 text-sm" onClick={() => setAbout((v) => !v)} aria-expanded={about}>
              <Icon name="info" size={15} />
              {t("training.about")}
            </button>
          ) : null}
        </div>
        {about ? (
          <div className="course-body mt-3">
            {data.about.map((a, i) => (
              <div key={i}>
                <h4 className="course-h">{a.title}</h4>
                <Blocks blocks={a.blocks} onZoom={() => {}} />
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <div className="training-grid">
        {data.courses.map((c) => (
          <button key={c.key} type="button" className="training-card" onClick={() => setOpen(c)}>
            <span className="training-card-icon"><UiGlyph icon={(c.icon ?? "training") as UiIcon} size={28} /></span>
            <span className="training-card-title">{c.title}</span>
            <span className="training-card-summary">{c.summary}</span>
            <span className="training-card-meta">
              {t("training.sections", { n: c.sections.length })} · {t("training.pages", { n: topicCount(c) })}
            </span>
            <span className="tool-card-cta">{t("training.start")}</span>
          </button>
        ))}
      </div>
    </>
  );
};

/* ───────────── курсы клана ───────────── */

const ClanCoursesView: React.FC = () => {
  const { t } = useI18n();
  const notify = useNotify();
  const { session } = useSession();
  const guest = session?.subjectType === "guest";
  const [data, setData] = React.useState<ClanCourseList | null>(null);
  const [open, setOpen] = React.useState<ClanCourse | null>(null);
  const [editing, setEditing] = React.useState<ClanCourse | "new" | null>(null);
  const [armed, confirm] = useConfirm();

  const load = React.useCallback(() => {
    trainingApi.clanCourses().then(setData).catch((err) => {
      setData({ can_edit: false, max_courses: 0, courses: [] });
      notify({ title: t("training.loadFailed"), message: errorText(err, t("training.loadFailed")), tone: "danger" });
    });
  }, [notify, t]);
  React.useEffect(() => {
    if (!guest) load();
  }, [guest, load]);

  if (guest) return <div className="panel"><EmptyState icon="training" title={t("training.clanTab")} hint={t("training.guestClan")} /></div>;
  if (!data) return <div className="panel"><Loading /></div>;

  if (open) {
    const course = parseMarkup(open.title, open.summary, open.body, open.id);
    const meta = <p className="mt-2 text-xs text-fg-3">{t("training.author", { name: open.author_name, date: formatDateTime(open.updated_at) })}</p>;
    return <CourseReader course={course} onBack={() => setOpen(null)} header={meta} />;
  }

  const move = async (index: number, dir: -1 | 1) => {
    const ids = data.courses.map((c) => c.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      setData(await trainingApi.reorder(ids));
    } catch (err) {
      notify({ title: t("training.saveFailed"), message: errorText(err, t("training.saveFailed")), tone: "danger" });
    }
  };
  const remove = async (c: ClanCourse) => {
    try {
      await trainingApi.remove(c.id);
      notify({ title: t("training.deleted"), message: c.title, tone: "success" });
      load();
    } catch (err) {
      notify({ title: t("training.saveFailed"), message: errorText(err, t("training.saveFailed")), tone: "danger" });
    }
  };
  const full = data.courses.length >= data.max_courses;

  return (
    <>
      {data.can_edit && data.courses.length ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-fg-3">{t("training.editorHint")}</span>
          <button type="button" className="btn btn-primary" disabled={full} title={full ? t("training.limit", { n: data.max_courses }) : undefined} onClick={() => setEditing("new")}>
            <Icon name="plus" size={16} />
            {t("training.newCourse")}
          </button>
        </div>
      ) : null}

      {data.courses.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon="training"
            title={t("training.clanEmpty")}
            hint={data.can_edit ? t("training.clanEmptyHint") : t("training.clanEmptyReader")}
            actions={data.can_edit ? (
              <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
                <Icon name="plus" size={16} />
                {t("training.newCourse")}
              </button>
            ) : null}
          />
        </div>
      ) : (
        <div className="training-grid">
          {data.courses.map((c, i) => (
            <div key={c.id} className="training-card is-static">
              <button type="button" className="training-card-open" onClick={() => setOpen(c)} aria-label={c.title} />
              <span className="training-card-icon"><UiGlyph icon="document" size={26} /></span>
              <span className="training-card-title">{c.title}</span>
              {c.summary ? <span className="training-card-summary">{c.summary}</span> : null}
              <span className="training-card-meta">{t("training.author", { name: c.author_name, date: formatDateTime(c.updated_at) })}</span>
              <span className="flex flex-wrap items-center gap-1.5 pt-2">
                <span className="tool-card-cta mr-auto pt-0">{t("training.start")}</span>
                {data.can_edit ? (
                  <span className="training-card-actions">
                    <button type="button" className="icon-btn" disabled={i === 0} onClick={() => void move(i, -1)} aria-label={t("pyramid.up")} title={t("pyramid.up")}><Icon name="chevronLeft" size={16} className="rotate-90" /></button>
                    <button type="button" className="icon-btn" disabled={i === data.courses.length - 1} onClick={() => void move(i, 1)} aria-label={t("pyramid.down")} title={t("pyramid.down")}><Icon name="chevronDown" size={16} /></button>
                    <button type="button" className="icon-btn" onClick={() => setEditing(c)} aria-label={t("training.editCourse")} title={t("training.editCourse")}><Icon name="edit" size={15} /></button>
                    <button
                      type="button"
                      className={cn("icon-btn", armed === c.id && "text-danger")}
                      onClick={() => confirm(c.id, () => void remove(c))}
                      aria-label={t("common.delete")}
                      title={armed === c.id ? t("common.confirmQ") : t("common.delete")}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}

      <ClanCourseEditor
        open={editing !== null}
        course={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </>
  );
};
