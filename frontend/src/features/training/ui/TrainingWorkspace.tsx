"use client";

import * as React from "react";
import { useContent, type TrainingModulePayload } from "@/entities/content";
import { Loading, assetUrl, UiGlyph, uiIconFromAsset, useT } from "@/shared";

/** Учебный центр штаба: модули обучения из реестра контента (правятся без релиза фронта). */
export const TrainingWorkspace: React.FC = () => {
  const t = useT();
  const { list, media, loading } = useContent();
  const modules = list<TrainingModulePayload>("training_module");
  const [openId, setOpenId] = React.useState<string | null>("terminal");
  const ready = modules.filter((m) => m.payload.status === "ready").length;
  const logo = media("clan_logo");

  return (
    <div className="tab-fade flex min-h-full flex-col items-center justify-center py-2">
      <section className="panel panel-corners w-full max-w-5xl rounded-md p-4 md:p-6">
        <div className="flex flex-col items-center gap-4 text-center md:flex-row md:text-left">
          <div className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo && <img src={logo} alt={t("common.crest")} width={112} height={112} className="ui-icon crest-frame h-24 w-24 rounded-md object-cover md:h-28 md:w-28" />}
            <UiGlyph icon="training" size={44} className="absolute -right-3 -bottom-3" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="hud-label text-muted">{t("training.kicker")}</div>
            <h1 className="title-brand mt-1 text-[1.35rem] md:text-[1.7rem]">📚 {t("nav.training.label")}</h1>
            <p className="mt-2 text-[0.85rem] text-white/85">
              {t("training.subtitle")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="badge-count min-w-0 px-2">{t("training.available")}: {ready}</span>
              <span className="badge-count min-w-0 px-2" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>{t("training.wip")}: {modules.length - ready}</span>
              <div className="progress-track w-40">
                <div className="progress-bar" style={{ width: `${modules.length ? (ready / modules.length) * 100 : 0}%`, background: "var(--accent)" }} />
              </div>
            </div>
          </div>
        </div>

        <div className="stencil-line my-5" />

        {loading ? (
          <Loading />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {modules.map(({ key, payload: m }) => {
              const open = openId === key;
              const wip = m.status === "wip";
              return (
                <article key={key} className={`panel-inner flex flex-col rounded p-3 transition-all ${open ? "ring-1 ring-[var(--accent)]" : ""} ${wip ? "opacity-80" : ""} ${open && m.body.length ? "md:col-span-2 xl:col-span-3" : ""}`}>
                  <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpenId(open ? null : key)} disabled={wip}>
                    {uiIconFromAsset(m.icon) ? (
                      <UiGlyph icon={uiIconFromAsset(m.icon)!} size={40} className="shrink-0" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={assetUrl(m.icon) ?? ""} alt="" width={40} height={40} className="ui-icon h-10 w-10 shrink-0 object-contain drop-shadow" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="truncate text-[0.9rem] font-bold text-white">{m.title}</h3>
                        <span className="hud-label shrink-0 rounded border px-1.5 py-0.5" style={{ color: wip ? "var(--warn)" : "var(--accent)", borderColor: wip ? "var(--warn)" : "var(--accent)" }}>
                          {t(wip ? "training.wip" : open ? "training.open" : "training.available")}
                        </span>
                      </div>
                      <p className="mt-1 text-[0.78rem] text-white/70">{m.summary}</p>
                    </div>
                  </button>
                  {open && m.body.length > 0 && (
                    <div className="console-log mt-3 rounded px-3 py-3 text-[0.78rem] leading-relaxed">
                      {m.body.map((line, i) => (
                        <div key={i} className="py-0.5">{line}</div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
