"use client";

import * as React from "react";
import { DonateBlock } from "@/features/feedback/ui/DonateBlock";

/** Раздел «Поддержать»: донат-блок (СБП / Boosty / Bybit Pay) отдельной страницей сайдбара. */
export const SupportWorkspace: React.FC = () => (
  <div className="tab-fade flex flex-col gap-3">
    <DonateBlock />
  </div>
);
