"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import type { ClanProfile } from "@/entities/clan";
import { FilterCards, assetUrl, useT, type MessageKey, type UiIcon } from "@/shared";
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
    <div className="tab-fade cabinet-page">
      <section data-guide="clan-hero" className="cabinet-hero panel panel-corners">
        <div className="cabinet-cover" style={cover ? { backgroundImage: `linear-gradient(120deg, rgba(45,75,45,0.86), rgba(18,35,23,0.38)), url(${cover})` } : undefined} aria-hidden />
        <div className="cabinet-hero-content">
          <div className="cabinet-avatar-wrap">
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element -- аватар Discord-сервера (CDN)
              <img src={icon} alt={name} width={132} height={132} className="cabinet-avatar" />
            ) : (
              <span className="cabinet-avatar flex items-center justify-center font-display text-5xl text-accent">{name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="hud-label text-accent">{t("clan.kicker")}{profile?.has_discord ? " • DISCORD" : ""}</div>
            <h1 className="cabinet-name">{name}</h1>
            <div className="cabinet-username">ID {profile?.id ?? "—"}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="cabinet-pill cabinet-pill-online">👥 {t("clan.members", { n: profile?.members ?? 0 })}</span>
              <span className="cabinet-pill">🏬 {t("clan.stockpilesCount", { n: profile?.stockpiles ?? 0 })}</span>
              <span className="cabinet-pill">◈ {ROLE_LABEL[role] ? t(ROLE_LABEL[role]) : role}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="panel panel-corners rounded-md p-3">
        <FilterCards
          guide="clan-sections"
          label={t("nav.clan.label")}
          items={sections.map((s) => ({ key: s.view, label: t(s.label), glyph: s.icon, hint: t(s.hint) }))}
          value={current?.view ?? null}
          onChange={(k) => k && onView(k as ClanView)}
        />
      </section>

      <div key={current?.view} className="min-w-0">{current?.render()}</div>
    </div>
  );
};
