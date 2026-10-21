"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { FilterCards, ThemeIcon, UiGlyph, assetUrl, useT, useTheme, type MessageKey, type Theme } from "@/shared";
import { useSession } from "@/features/cabinet/model/session-context";
import { LanguagePanel } from "@/features/cabinet/ui/LanguageSwitch";

const ROLE_LABEL: Record<string, MessageKey> = {
  owner: "role.owner",
  admin: "role.admin",
  officer: "role.officer",
  member: "role.member",
  guest: "role.guest",
};

type Section = "profile" | "language" | "appearance";

/** «Настройки»: профиль участника, язык интерфейса и внешний вид. */
export const CabinetWorkspace: React.FC = () => {
  const t = useT();
  const { session, logout } = useSession();
  const { media } = useContent();
  const [section, setSection] = React.useState<Section>("profile");
  if (!session) return null;
  const guest = session.subjectType === "guest";
  const role = ROLE_LABEL[session.role] ? t(ROLE_LABEL[session.role]) : session.role;
  const cover = media("bg_cabinet");
  const avatar = assetUrl(session.avatarUrl);
  const name = session.subjectType === "guest" ? t("role.guest") : session.displayName ?? session.userId;

  return (
    <div className="tab-fade cabinet-page">
      <section className="panel panel-corners rounded-md p-4">
        <div className="flex items-center gap-3">
          <UiGlyph icon="cabinet" size={40} />
          <div className="min-w-0">
            <div className="hud-label text-muted">{t("settings.kicker")}</div>
            <h1 className="panel-title mt-1 text-[1rem] md:text-[1.2rem]">⚙ {t("nav.cabinet.label")}</h1>
          </div>
        </div>
        <FilterCards
          guide="settings-sections"
          label={t("nav.cabinet.label")}
          items={[
            { key: "profile", label: t("settings.profile"), glyph: "cabinet", hint: t("settings.profileHint") },
            { key: "language", label: t("settings.language"), glyph: "map", hint: t("settings.languageHint") },
            { key: "appearance", label: t("settings.appearance"), glyph: "terminal", hint: t("settings.appearanceHint") },
          ]}
          value={section}
          onChange={(k) => k && setSection(k as Section)}
        />
      </section>

      {section === "language" ? <LanguagePanel persist={session.subjectType === "user"} /> : null}
      {section === "appearance" ? <AppearancePanel /> : null}
      {section === "profile" ? (
      <>
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
            <div className="cabinet-username">ID {session.userId}{guest ? null : <> <span>•</span> {t("cabinet.clanLower")} {session.clanId}</>}</div>
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
          {!guest && <InfoRow label={t("cabinet.clan")} value={session.clanId} />}
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
      </div>
      </>
      ) : null}
    </div>
  );
};

const THEMES: { key: Theme; label: MessageKey; hint: MessageKey }[] = [
  { key: "dark", label: "nav.themeNight", hint: "settings.themeDarkHint" },
  { key: "light", label: "nav.themeSimple", hint: "settings.themeLightHint" },
];

/** Внешний вид: тема сайта (раньше — кнопка внизу бокового меню). */
const AppearancePanel: React.FC = () => {
  const t = useT();
  const { theme, toggleTheme } = useTheme();
  return (
    <section data-guide="settings-appearance" className="panel panel-corners rounded-md p-4">
      <div className="panel-title">🎨 {t("settings.appearance")}</div>
      <div className="cabinet-rule" />
      <div className="theme-choices">
        {THEMES.map((item) => {
          const on = theme === item.key;
          return (
            <button key={item.key} type="button" className={`theme-choice ${on ? "is-active" : ""}`} aria-pressed={on} onClick={() => !on && toggleTheme()}>
              <span className={`theme-preview theme-preview-${item.key}`} aria-hidden>
                <ThemeIcon theme={item.key} size={34} />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="theme-choice-label">{t(item.label)}</span>
                <span className="theme-choice-hint">{t(item.hint)}</span>
              </span>
              <span className="theme-choice-state">{on ? `▣ ${t("settings.active")}` : "▢"}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

const InfoRow: React.FC<{ label: string; value: string; mono?: boolean; accent?: boolean }> = ({ label, value, mono, accent }) => (
  <div className="cabinet-info-row">
    <span className="hud-label text-muted">{label}</span>
    <span className={`${mono ? "font-mono" : ""} ${accent ? "text-accent" : "text-white"} truncate`}>{value}</span>
  </div>
);
