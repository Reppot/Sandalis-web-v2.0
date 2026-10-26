"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import type { ClanProfile } from "@/entities/clan";
import { assetUrl, useT, type MessageKey, type UiIcon } from "@/shared";
import type { ClanView } from "@/app/_shell/tabs";

export interface ClanSection {
  view: ClanView;
  icon: UiIcon;
  label: MessageKey;
  hint: MessageKey;
  render: () => React.ReactNode;
}

const ROLE_LABEL: Record<string, MessageKey> = {
  owner: "role.owner",
  admin: "role.admin",
  officer: "role.officer",
  member: "role.member",
  guest: "role.guest",
};

/**
 * «Ваш клан»: шапка с аватаром и названием Discord-сервера (как в личном кабинете) и
 * подразделы клана — текущие заказы, склады, обучение, управление. Подразделы собирает
 * page.tsx (каждый — отдельная фича).
 */
export const ClanWorkspace: React.FC<{ profile: ClanProfile | null; role: string; sections: ClanSection[]; view: ClanView; onView: (v: ClanView) => void }> = ({
  profile,
  role,
  sections,
  view,
  onView,
}) => {
  const t = useT();
  const { media } = useContent();
  const cover = media("bg_cabinet");
  const name = profile?.name ?? "…";
  const icon = assetUrl(profile?.icon_url ?? null);
  const current = sections.find((s) => s.view === view) ?? sections[0];

  return (
    <div className="tab-fade flex min-h-full flex-col gap-4">
      <section data-guide="clan-hero" className="panel clan-hero">
        <div className="clan-hero-cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined} aria-hidden />
        <div className="clan-hero-body">
          {icon ? (
            // eslint-disable-next-line @next/next/no-img-element -- аватар Discord-сервера (CDN)
            <img src={icon} alt={name} width={64} height={64} className="clan-hero-avatar" />
          ) : (
            <span className="clan-hero-avatar clan-hero-letter">{name.charAt(0).toUpperCase()}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="page-eyebrow">{t("clan.kicker")}{profile?.has_discord ? " · Discord" : ""}</div>
            <h1 className="clan-hero-name">{name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="cabinet-pill cabinet-pill-online">{t("clan.members", { n: profile?.members ?? 0 })}</span>
            <span className="cabinet-pill">{t("clan.stockpilesCount", { n: profile?.stockpiles ?? 0 })}</span>
            <span className="cabinet-pill">{ROLE_LABEL[role] ? t(ROLE_LABEL[role]) : role}</span>
          </div>
        </div>
        <nav data-guide="clan-sections" className="clan-tabs md:hidden" aria-label={t("nav.clan.label")}>
          {sections.map((s) => (
            <button key={s.view} type="button" className={`clan-tab ${current?.view === s.view ? "is-active" : ""}`} aria-current={current?.view === s.view ? "page" : undefined} onClick={() => onView(s.view)}>
              {t(s.label)}
            </button>
          ))}
        </nav>
      </section>

      <div key={current?.view} className="min-w-0">{current?.render()}</div>
    </div>
  );
};
