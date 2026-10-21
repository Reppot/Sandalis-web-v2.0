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
      <section data-guide="training-soon" className="panel panel-corners coming-soon w-full max-w-3xl rounded-md p-8 text-center md:p-12">
        <div className="relative mx-auto w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt={t("common.crest")} width={128} height={128} className="ui-icon crest-frame h-28 w-28 rounded-md object-cover md:h-32 md:w-32" />}
          <UiGlyph icon="training" size={48} className="absolute -right-4 -bottom-4" />
        </div>
        <div className="hud-label mt-8 text-muted">{t("training.kicker")}</div>
        <h1 className="coming-soon-title">COMING SOON</h1>
        <p className="mx-auto mt-3 max-w-xl text-[0.9rem] text-white/75">{t("training.soon")}</p>
      </section>
    </div>
  );
};
