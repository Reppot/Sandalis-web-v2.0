"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import { Icon, PageHeader, Segmented, ThemeIcon, assetUrl, useT, useTheme, type MessageKey, type Theme } from "@/shared";
import { useSession } from "@/features/cabinet/model/session-context";
import { LanguagePanel } from "@/features/cabinet/ui/LanguageSwitch";
import { DeveloperPanel } from "@/features/cabinet/ui/DeveloperPanel";
import { NotifyPanel } from "@/features/cabinet/ui/NotifyPanel";

const ROLE_LABEL: Record<string, MessageKey> = {
  owner: "role.owner",
  admin: "role.admin",
  officer: "role.officer",
  member: "role.member",
  guest: "role.guest",
};

type Section = "profile" | "language" | "appearance" | "notify" | "developer";

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
  const name = guest ? t("role.guest") : session.displayName ?? session.userId;

  return (
    <div className="tab-fade cabinet-page">
      <PageHeader icon="cabinet" eyebrow={t("settings.kicker")} title={t("nav.cabinet.label")}>
        <div data-guide="settings-sections" className="mt-5">
          <Segmented
            size="lg"
            label={t("nav.cabinet.label")}
            value={section}
            onChange={setSection}
            options={[
              { value: "profile", label: t("settings.profile"), title: t("settings.profileHint") },
              { value: "language", label: t("settings.language"), title: t("settings.languageHint") },
              { value: "appearance", label: t("settings.appearance"), title: t("settings.appearanceHint") },
              ...(session.subjectType === "user" ? [{ value: "notify" as const, label: t("settings.notify"), title: t("settings.notifyHint") }] : []),
              ...(session.siteAdmin ? [{ value: "developer" as const, label: t("settings.developer"), title: t("settings.developerHint") }] : []),
            ]}
          />
        </div>
      </PageHeader>

      {section === "language" ? <LanguagePanel persist={session.subjectType === "user"} /> : null}
      {section === "appearance" ? <AppearancePanel /> : null}
      {section === "notify" && session.subjectType === "user" ? <NotifyPanel /> : null}
      {section === "developer" && session.siteAdmin ? <DeveloperPanel currentClan={session.clanId} developer={session.developer || session.role === "owner"} /> : null}
      {section === "profile" ? (
        <>
          <section className="cabinet-hero panel">
            <div className="cabinet-cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined} aria-hidden />
            <div className="cabinet-hero-content">
              <div className="cabinet-avatar-wrap">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- аватар Discord CDN
                  <img src={avatar} alt={t("cabinet.avatar", { name })} width={132} height={132} className="cabinet-avatar" />
                ) : (
                  <span className="cabinet-avatar flex items-center justify-center text-5xl font-semibold text-fg-2">{name.charAt(0).toUpperCase()}</span>
                )}
                <span className="cabinet-online-dot" title={t("cabinet.online")} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="page-eyebrow">{guest ? t("cabinet.guestKicker") : `${t("cabinet.kicker")} · ${session.subjectType === "user" ? "Discord" : "Clan token"}`}</div>
                <h1 className="cabinet-name">{name}</h1>
                <div className="cabinet-username">
                  ID {session.userId}
                  {guest ? null : (
                    <>
                      <span>·</span> {t("cabinet.clanLower")} {session.clanId}
                    </>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="cabinet-pill cabinet-pill-online">{t("cabinet.online")}</span>
                  <span className="cabinet-pill">{role}</span>
                </div>
              </div>
              <button className="btn btn-ghost cabinet-logout text-danger" onClick={() => void logout()}>
                <Icon name="logout" size={16} />
                {t("cabinet.logout")}
              </button>
            </div>
          </section>

          <div className="cabinet-grid">
            <section className="panel cabinet-card">
              <div className="panel-title">{t("cabinet.identity")}</div>
              <div className="mt-2">
                <InfoRow label={t("cabinet.memberId")} value={session.userId} mono />
                <InfoRow label={t("cabinet.callsign")} value={name} />
                {!guest && <InfoRow label={t("cabinet.clan")} value={session.clanId} />}
                <InfoRow label={t("cabinet.role")} value={role} />
                <InfoRow label={t("cabinet.loginChannel")} value={t(session.subjectType === "user" ? "cabinet.viaDiscord" : guest ? "cabinet.viaGuest" : "cabinet.viaToken")} />
              </div>
            </section>

            <section className="panel cabinet-card">
              <div className="flex items-center justify-between gap-2">
                <div className="panel-title">{t("cabinet.scopes")}</div>
                <span className="count-pill">{t("cabinet.scopesCount", { n: session.scopes.length })}</span>
              </div>
              <div className="cabinet-roles mt-4">
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

const THEME_CHOICES: { key: Theme; label: MessageKey; hint: MessageKey }[] = [
  { key: "dark", label: "nav.themeNight", hint: "settings.themeDarkHint" },
  { key: "light", label: "nav.themeSimple", hint: "settings.themeLightHint" },
  { key: "amber", label: "settings.themeAmber", hint: "settings.themeAmberHint" },
  { key: "contrast", label: "settings.themeContrast", hint: "settings.themeContrastHint" },
  { key: "noir", label: "settings.themeNoir", hint: "settings.themeNoirHint" },
  { key: "soft", label: "settings.themeSoft", hint: "settings.themeSoftHint" },
];

/** Внешний вид: тема сайта — карточки с мини-превью. */
const AppearancePanel: React.FC = () => {
  const t = useT();
  const { theme, setTheme } = useTheme();
  return (
    <section data-guide="settings-appearance" className="panel p-5">
      <div className="panel-title">{t("settings.appearance")}</div>
      <p className="mt-1 text-sm text-fg-3">{t("settings.appearanceHint")}</p>
      <div className="theme-choices mt-5">
        {THEME_CHOICES.map((item) => {
          const on = theme === item.key;
          return (
            <button key={item.key} type="button" className={`theme-choice ${on ? "is-active" : ""}`} aria-pressed={on} onClick={() => !on && setTheme(item.key)}>
              <span className={`theme-preview theme-preview-${item.key}`} aria-hidden>
                <ThemeIcon theme={item.key} size={26} />
              </span>
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="theme-choice-label">{t(item.label)}</span>
                  <span className="theme-choice-hint">{t(item.hint)}</span>
                </span>
                {on ? (
                  <span className="theme-choice-check" aria-label={t("settings.active")}>
                    <Icon name="check" size={12} strokeWidth={3} />
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

const InfoRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="cabinet-info-row">
    <span className="text-fg-3">{label}</span>
    <span className={`${mono ? "font-mono text-[0.8rem]" : "font-medium"} truncate text-fg`}>{value}</span>
  </div>
);
