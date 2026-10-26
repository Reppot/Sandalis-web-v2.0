"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { UiGlyph, useT } from "@/shared";

/** Учебный центр штаба: раздел готовится — пока заглушка «Coming soon». */
export const TrainingWorkspace: React.FC = () => {
  const t = useT();
  const { media } = useContent();
  const logo = media("clan_logo");

  return (
    <div className="tab-fade flex min-h-[70vh] flex-col items-center justify-center py-2">
      <section data-guide="training-soon" className="panel coming-soon w-full max-w-2xl p-8 text-center md:p-14">
        <div className="relative mx-auto w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt={t("common.crest")} width={128} height={128} className="h-24 w-24 rounded-[26px] object-cover shadow-[var(--shadow-2)] md:h-28 md:w-28" />}
          <span className="icon-tile absolute -right-3 -bottom-3 h-11 w-11 shadow-[var(--shadow-2)]"><UiGlyph icon="training" size={22} /></span>
        </div>
        <div className="page-eyebrow mt-8">{t("training.kicker")}</div>
        <h1 className="coming-soon-title">{t("training.soonTitle")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-[0.9rem] text-fg-2">{t("training.soon")}</p>
      </section>
    </div>
  );
};
