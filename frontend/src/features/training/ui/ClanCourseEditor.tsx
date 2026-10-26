"use client";

import * as React from "react";
import { Button, Field, Modal, Segmented, errorText, useNotify, useT } from "@/shared";
import { parseMarkup, trainingApi, type ClanCourse } from "@/features/training/model/course";
import { Blocks } from "@/features/training/ui/CourseReader";

/** Создание и правка курса клана: название, описание и текст в простой разметке с предпросмотром. */
export const ClanCourseEditor: React.FC<{ open: boolean; course: ClanCourse | null; onClose: () => void; onSaved: (c: ClanCourse) => void }> = ({ open, course, onClose, onSaved }) => {
  const t = useT();
  const notify = useNotify();
  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [body, setBody] = React.useState("");
  const [mode, setMode] = React.useState<"edit" | "preview">("edit");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(course?.title ?? "");
    setSummary(course?.summary ?? "");
    setBody(course?.body ?? "");
    setMode("edit");
  }, [open, course]);

  const preview = React.useMemo(() => (mode === "preview" ? parseMarkup(title, summary, body, "preview") : null), [mode, title, summary, body]);

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const input = { title: title.trim(), summary: summary.trim(), body };
      const saved = course ? await trainingApi.update(course.id, input) : await trainingApi.create(input);
      notify({ title: t("training.saved"), message: saved.title, tone: "success" });
      onSaved(saved);
    } catch (err) {
      notify({ title: t("training.saveFailed"), message: errorText(err, t("training.saveFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={course ? t("training.editCourse") : t("training.newCourse")}
      icon="training"
      widthClass="max-w-4xl"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={() => void save()} isLoading={busy} disabled={!title.trim()}>{t("common.save")}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 p-5">
        <Field label={t("training.form.title")} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={t("training.form.titlePlaceholder")} />
        <Field label={t("training.form.summary")} value={summary} maxLength={300} onChange={(e) => setSummary(e.target.value)} placeholder={t("training.form.summaryPlaceholder")} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="field-label">{t("training.form.body")}</span>
          <Segmented
            size="sm"
            label={t("training.form.body")}
            value={mode}
            onChange={setMode}
            options={[{ value: "edit", label: t("training.form.write") }, { value: "preview", label: t("training.form.preview") }]}
          />
        </div>
        {mode === "edit" ? (
          <>
            <textarea className="field field-mono min-h-[22rem] resize-y" value={body} maxLength={60000} onChange={(e) => setBody(e.target.value)} placeholder={t("training.form.example")} spellCheck />
            <p className="text-xs leading-relaxed text-fg-3">{t("training.form.help")}</p>
          </>
        ) : (
          <div className="course-preview">
            {preview && preview.sections.some((s) => s.title || s.topics.some((tp) => tp.title || tp.blocks.length)) ? (
              preview.sections.map((s, si) => (
                <div key={si}>
                  {s.title ? <div className="page-eyebrow mt-4">{s.title}</div> : null}
                  {s.topics.map((tp, ti) => (
                    <div key={ti} className="mt-2">
                      {tp.title ? <h3 className="course-page-title text-lg">{tp.title}</h3> : null}
                      <div className="course-body"><Blocks blocks={tp.blocks} onZoom={() => {}} /></div>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-fg-3">{t("training.form.previewEmpty")}</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
