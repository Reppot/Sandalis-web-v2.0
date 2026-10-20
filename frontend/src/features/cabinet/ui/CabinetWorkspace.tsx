"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { Scopes } from "@/entities/session";
import { assetUrl, useT, type MessageKey } from "@/shared";
import { useSession } from "@/features/cabinet/model/session-context";
import { ClanTokenPanel } from "@/features/cabinet/ui/ClanTokenPanel";
import { DiscordWebhookPanel } from "@/features/cabinet/ui/DiscordWebhookPanel";
import { InvitesPanel } from "@/features/cabinet/ui/InvitesPanel";
import { LanguagePanel } from "@/features/cabinet/ui/LanguageSwitch";

const ROLE_LABEL: Record<string, MessageKey> = {
  owner: "role.owner",
  admin: "role.admin",
  officer: "role.officer",
  member: "role.member",
  guest: "role.guest",
};

/** Личный кабинет: профиль Discord, роль и права, управление кланом для офицеров. */
export const CabinetWorkspace: React.FC = () => {
  const t = useT();
  const { session, logout, can } = useSession();
  const { media } = useContent();
  if (!session) return null;
  const role = ROLE_LABEL[session.role] ? t(ROLE_LABEL[session.role]) : session.role;
  const cover = media("bg_cabinet");
  const avatar = assetUrl(session.avatarUrl);
  const name = session.subjectType === "guest" ? t("role.guest") : session.displayName ?? session.userId;

  return (
    <div className="tab-fade cabinet-page">
      <section className="cabinet-hero panel panel-corners">
        <div className="cabinet-cover" style={cover ? { backgroundImage: `linear-gradient(120deg, rgba(45,75,45,0.86), rgba(18,35,23,0.38)), url(${cover})` } : undefined} aria-hidden />
        <div className="cabinet-hero-content">
          <div className="cabinet-avatar-wrap">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- аватар Discord CDN
              <img src={avatar} alt={t("cabinet.avatar", { name })} width={132} height={132} className="cabinet-avatar" />
            ) : (
              <span className="cabinet-avatar flex items-center justify-center font-display text-5xl text-accent">{name.charAt(0).toUpperCase()}</span>
            )}
            <span className="cabinet-online-dot" title={t("cabinet.online")} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="hud-label text-accent">{session.subjectType === "guest" ? t("cabinet.guestKicker") : `${t("cabinet.kicker")} • ${session.subjectType === "user" ? "DISCORD LINK" : "CLAN TOKEN"}`}</div>
            <h1 className="cabinet-name">{name}</h1>
            <div className="cabinet-username">ID {session.userId} <span>•</span> {t("cabinet.clanLower")} {session.clanId}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="cabinet-pill cabinet-pill-online">● {t("cabinet.online")}</span>
              <span className="cabinet-pill">◈ {role}</span>
            </div>
          </div>
          <button className="btn btn-danger cabinet-logout" onClick={() => void logout()}>{t("cabinet.logout")}</button>
        </div>
      </section>

      <div className="cabinet-grid">
        <section className="panel panel-corners cabinet-card">
          <div className="panel-title">▣ {t("cabinet.identity")}</div>
          <div className="cabinet-rule" />
          <InfoRow label={t("cabinet.memberId")} value={session.userId} mono />
          <InfoRow label={t("cabinet.callsign")} value={name} />
          <InfoRow label={t("cabinet.clan")} value={session.clanId} />
          <InfoRow label={t("cabinet.role")} value={role} accent />
          <InfoRow label={t("cabinet.loginChannel")} value={t(session.subjectType === "user" ? "cabinet.viaDiscord" : session.subjectType === "guest" ? "cabinet.viaGuest" : "cabinet.viaToken")} />
        </section>

        <section className="panel panel-corners cabinet-card">
          <div className="flex items-center justify-between gap-2">
            <div className="panel-title">♟ {t("cabinet.scopes")}</div>
            <span className="badge-count min-w-0">{t("cabinet.scopesCount", { n: session.scopes.length })}</span>
          </div>
          <div className="cabinet-rule" />
          <div className="cabinet-roles">
            {session.scopes.map((scope) => (
              <span className="cabinet-role" key={scope}>
                <span className="cabinet-role-dot" />
                {scope === "*" ? t("cabinet.fullAccess") : scope}
              </span>
            ))}
          </div>
        </section>

        <section className="panel panel-corners cabinet-card cabinet-security-card">
          <div className="panel-title">◈ {t("cabinet.session")}</div>
          <div className="cabinet-rule" />
          <div className="cabinet-session-grid">
            <div><span className="hud-label text-muted">{t("cabinet.state")}</span><strong className="text-safe">{t("cabinet.active")}</strong></div>
            <div><span className="hud-label text-muted">{t("common.access")}</span><strong className="text-accent">{role.toUpperCase()}</strong></div>
            <div><span className="hud-label text-muted">{t("cabinet.storage")}</span><strong>SANDALIS API</strong></div>
          </div>
          <p className="mt-4 text-[0.78rem] leading-relaxed text-white/65">{t("cabinet.sessionHint")}</p>
        </section>
      </div>

      <LanguagePanel persist={session.subjectType === "user"} />
      {can(Scopes.CLAN_SETTINGS_WRITE) && <DiscordWebhookPanel />}
      {can(Scopes.CLAN_MEMBERS_READ) && <InvitesPanel canManage={can(Scopes.CLAN_MEMBERS_WRITE)} />}
      {can(Scopes.CLAN_SETTINGS_WRITE) && <ClanTokenPanel />}
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string; mono?: boolean; accent?: boolean }> = ({ label, value, mono, accent }) => (
  <div className="cabinet-info-row">
    <span className="hud-label text-muted">{label}</span>
    <span className={`${mono ? "font-mono" : ""} ${accent ? "text-accent" : "text-white"} truncate`}>{value}</span>
  </div>
);
