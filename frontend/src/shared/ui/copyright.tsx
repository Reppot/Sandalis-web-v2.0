"use client";

import * as React from "react";
import { useT } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { COPYRIGHT_HOLDER, copyrightYears } from "@/shared/lib/copyright";

/** Уведомление об авторских правах внизу страниц (см. LICENSE в корне репозитория). */
export const CopyrightNotice: React.FC<{ className?: string }> = ({ className }) => {
  const t = useT();
  return (
    <footer className={cn("copyright-notice", className)}>
      <span>© {copyrightYears()} {COPYRIGHT_HOLDER}. {t("legal.rights")}</span>
      <span className="copyright-notice-terms">{t("legal.terms")}</span>
    </footer>
  );
};
