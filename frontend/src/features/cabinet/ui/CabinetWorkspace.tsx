"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { Scopes } from "@/entities/session";
import { assetUrl } from "@/shared";
import { useSession } from "@/features/cabinet/model/session-context";
import { ClanTokenPanel } from "@/features/cabinet/ui/ClanTokenPanel";
import { DiscordWebhookPanel } from "@/features/cabinet/ui/DiscordWebhookPanel";
import { InvitesPanel } from "@/features/cabinet/ui/InvitesPanel";

const ROLE_LABEL: Record<string, string> = {
  owner: "Командир клана",
  admin: "Администратор",
  officer: "Офицер",
  member: "Боец",
  guest: "Гость",
};

/** Личный кабинет: профиль Discord, роль и права, управление кланом для офицеров. */
export const CabinetWorkspace: React.FC = () => {
  const { session, logout, can } = useSession();
  const { media } = useContent();
  if (!session) return null;
  const cover = media("bg_cabinet");
  const avatar = assetUrl(session.avatarUrl);
  const name = session.displayName ?? session.userId;

  return (
    <div className="tab-fade cabinet-page">
      <section className="cabinet-hero panel panel-corners">
        <div className="cabinet-cover" style={cover ? { backgroundImage: `linear-gradient(120deg, rgba(45,75,45,0.86), rgba(18,35,23,0.38)), url(${cover})` } : undefined} aria-hidden />
        <div className="cabinet-hero-content">
          <div className="cabinet-avatar-wrap">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- аватар Discord CDN
              <img src={avatar} alt={`Аватар ${name}`} width={132} height={132} className="cabinet-avatar" />
            ) : (
              <span className="cabinet-avatar flex items-center justify-center font-display text-5xl text-accent">{name.charAt(0).toUpperCase()}</span>
            )}
            <span className="cabinet-online-dot" title="В сети" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="hud-label text-accent">ЛИЧНЫЙ КАБИНЕТ • {session.subjectType === "user" ? "DISCORD LINK" : "CLAN TOKEN"}</div>
            <h1 className="cabinet-name">{name}</h1>
            <div className="cabinet-username">ID {session.userId} <span>•</span> клан {session.clanId}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="cabinet-pill cabinet-pill-online">● В сети</span>
              <span className="cabinet-pill">◈ {ROLE_LABEL[session.role] ?? session.role}</span>
            </div>
          </div>
          <button className="btn btn-danger cabinet-logout" onClick={() => void logout()}>Выйти из терминала</button>
        </div>
      </section>

      <div className="cabinet-grid">
        <section className="panel panel-corners cabinet-card">
          <div className="panel-title">▣ Идентификация участника</div>
          <div className="cabinet-rule" />
          <InfoRow label="ID участника" value={session.userId} mono />
          <InfoRow label="Позывной" value={name} />
          <InfoRow label="Клан" value={session.clanId} />
          <InfoRow label="Роль" value={ROLE_LABEL[session.role] ?? session.role} accent />
          <InfoRow label="Канал входа" value={session.subjectType === "user" ? "Discord / invite-код" : "API-токен клана"} />
        </section>

        <section className="panel panel-corners cabinet-card">
          <div className="flex items-center justify-between gap-2">
            <div className="panel-title">♟ Реестр прав</div>
            <span className="badge-count min-w-0">{session.scopes.length} ПРАВ</span>
          </div>
          <div className="cabinet-rule" />
          <div className="cabinet-roles">
            {session.scopes.map((scope) => (
              <span className="cabinet-role" key={scope}>
                <span className="cabinet-role-dot" />
                {scope === "*" ? "Полный доступ" : scope}
              </span>
            ))}
          </div>
        </section>

        <section className="panel panel-corners cabinet-card cabinet-security-card">
          <div className="panel-title">◈ Сеанс терминала</div>
          <div className="cabinet-rule" />
          <div className="cabinet-session-grid">
            <div><span className="hud-label text-muted">Состояние</span><strong className="text-safe">АКТИВЕН</strong></div>
            <div><span className="hud-label text-muted">Доступ</span><strong className="text-accent">{(ROLE_LABEL[session.role] ?? session.role).toUpperCase()}</strong></div>
            <div><span className="hud-label text-muted">Хранилище</span><strong>SANDALIS API</strong></div>
          </div>
          <p className="mt-4 text-[0.78rem] leading-relaxed text-white/65">Сессия хранится в защищённой HttpOnly-cookie сайта. Токен не отображается и недоступен скриптам страницы.</p>
        </section>
      </div>

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
