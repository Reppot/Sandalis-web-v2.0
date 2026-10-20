"use client";

import * as React from "react";
import { useContent } from "@/entities/content";
import type { UserSession } from "@/entities/session";
import { env, errorText, useT, type MessageKey } from "@/shared";
import { authApi, type AccessLevel, type DiscordSetup, type SetupChoice } from "@/features/cabinet/api/authApi";
import { LanguageSwitch } from "@/features/cabinet/ui/LanguageSwitch";

// Ключи = AppError.code, которые бэкенд кладёт в FRONTEND_URL?error=<code>.
const OAUTH_ERRORS: Record<string, MessageKey> = {
  forbidden: "login.err.forbidden",
  state_invalid: "login.err.state_invalid",
  exchange_failed: "login.err.exchange_failed",
  profile_failed: "login.err.profile_failed",
  disabled: "login.err.disabled",
  setup_expired: "login.err.setup_expired",
};

const ROLE_KEY: Record<string, MessageKey> = {
  owner: "role.owner",
  admin: "role.admin",
  officer: "role.officer",
  member: "role.member",
  guest: "role.guest",
};

const DiscordGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

/**
 * Экран входа старого терминала: видео на фоне (URL — из реестра медиа в БД, а не из
 * локальной папки), Discord OAuth, выбор своего сервера или клана для вступления
 * Discord-сервера и гостевой просмотр.
 */
export const LoginScreen: React.FC<{ onLoggedIn: (s: UserSession) => void }> = ({ onLoggedIn }) => {
  const t = useT();
  const { mediaEntry, media } = useContent();
  const [oauthError, setOauthError] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [setupMode, setSetupMode] = React.useState(false);
  const [setup, setSetup] = React.useState<DiscordSetup | null>(null);
  const [videoFailed, setVideoFailed] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const video = mediaEntry("login_video");
  const logo = media("clan_logo");

  React.useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (code) setOauthError(code);
    if (params.get("setup") === "guild") setSetupMode(true);
    if (code || params.get("setup")) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  React.useEffect(() => {
    if (!setupMode) return;
    authApi
      .getSetup()
      .then(setSetup)
      .catch(() => {
        setSetupMode(false);
        setOauthError("setup_expired");
      });
  }, [setupMode]);

  const run = async (action: () => Promise<UserSession>) => {
    setBusy(true);
    setError("");
    setOauthError("");
    try {
      const session = await action();
      window.history.replaceState(null, "", window.location.pathname);
      onLoggedIn(session);
    } catch (err) {
      setError(`[${t("login.denied")}] ${errorText(err, t("login.noLink")).toUpperCase()}`);
    } finally {
      setBusy(false);
    }
  };

  const shownError = error || (oauthError ? t(OAUTH_ERRORS[oauthError] ?? "login.err.generic") : "");
  const poster = video?.poster ? (video.poster.startsWith("/") ? `${env.apiUrl}${video.poster}` : video.poster) : media("bg_home");

  return (
    <main className="auth-screen">
      <div className="auth-video-bg" aria-hidden>
        <div className="auth-video-fallback" style={poster ? { backgroundImage: `radial-gradient(ellipse at center, rgba(16,28,18,0.65) 0%, rgba(6,10,7,0.9) 100%), url(${poster})` } : undefined} />
        {video?.url && !videoFailed && !reducedMotion && (
          <video className="auth-video" src={video.url} poster={poster ?? undefined} autoPlay loop muted playsInline preload="metadata" onError={() => setVideoFailed(true)} />
        )}
        <div className="auth-video-overlay" />
      </div>

      <section className="auth-panel panel panel-corners relative z-10">
        <div className="auth-scanline" aria-hidden />
        <div className="auth-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt={t("common.crest")} width={180} height={230} className="auth-logo" />}
          <h1 className="auth-title">SINDARIS Terminal</h1>
          <p className="auth-subtitle">LOGISTICS OVERWATCH • FOXHOLE</p>
          <div data-guide="login-lang"><LanguageSwitch className="mt-3 justify-center" /></div>
        </div>

        <div className="auth-rule" />

        {setupMode ? (
          <ServerPicker setup={setup} busy={busy} onPick={(choice) => void run(() => authApi.completeSetup(choice))} onCancel={() => setSetupMode(false)} />
        ) : (
          <>
            <div className="auth-form">
              <a href={authApi.discordLoginUrl()} data-guide="login-discord" className="btn btn-primary auth-submit" style={{ backgroundColor: "#5865F2", borderColor: "#5865F2", color: "#fff", textDecoration: "none" }}>
                <DiscordGlyph />
                <span>{t("login.discord")}</span>
              </a>
              <p data-guide="login-owner" className="auth-hint">{t("login.ownerHint")}</p>
            </div>
          </>
        )}

        {shownError && (
          <div className="auth-error relative z-[1]" role="alert">
            <span className="auth-error-mark">!</span>
            <span>{shownError}</span>
          </div>
        )}

        {!setupMode && (
          <>
            <div className="auth-rule" />
            <div className="auth-form">
              <button type="button" className="btn auth-submit" disabled={busy} data-guide="login-guest" onClick={() => void run(() => authApi.loginAsGuest())}>
                <span className={busy ? "pulse" : ""}>👁 {t("login.guest")}</span>
              </button>
              <p className="auth-hint">{t("login.guestHint")}</p>
            </div>
          </>
        )}

        {env.enableDevLogin && !setupMode && (
          <>
            <div className="auth-rule" />
            <button type="button" className="btn auth-submit" disabled={busy} onClick={() => void run(() => authApi.loginWithDevToken({ userId: "dev-admin", clanId: "SANDALIS", role: "owner", displayName: "DevAdmin" }))}>
              DEV-TOKEN (ENV≠PROD)
            </button>
          </>
        )}
      </section>
    </main>
  );
};

const LEVEL_KEY: Record<AccessLevel, MessageKey> = { basic: "level.basic", medium: "level.medium", high: "level.high" };
const roleColor = (color: number) => (color ? `#${color.toString(16).padStart(6, "0")}` : "rgba(229,231,235,0.55)");

/** Выбор после входа: свои серверы (клан), кланы с ботом (вступить), свои кланы (войти). */
const ServerPicker: React.FC<{
  setup: DiscordSetup | null;
  busy: boolean;
  onPick: (choice: SetupChoice) => void;
  onCancel: () => void;
}> = ({ setup, busy, onPick, onCancel }) => {
  const t = useT();
  if (!setup) return <p className="hud-label pulse py-6 text-center text-muted">{t("setup.loading")}</p>;

  return (
    <div className="auth-form mt-0">
      {setup.joins.length > 0 && (
        <>
          <div className="auth-label">{t("setup.joinTitle")}</div>
          <p className="auth-hint mt-0 mb-3">{t("setup.joinHint", { name: setup.displayName })}</p>
          <ul data-guide="setup-joins" className="auth-servers scroll-area mb-4">
            {setup.joins.map((j) => (
              <li key={j.clanId}>
                <button type="button" className="auth-server items-start" disabled={busy} onClick={() => onPick({ joinClanId: j.clanId })}>
                  {j.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={j.iconUrl} alt="" width={40} height={40} className="auth-server-icon" />
                  ) : (
                    <span className="auth-server-icon auth-server-letter">{j.name.charAt(0).toUpperCase()}</span>
                  )}
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-sm text-white">{t("setup.join", { clan: j.name })}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {j.roles.length ? (
                        j.roles.map((r) => (
                          <span key={r.name} className="auth-role-chip" style={{ borderColor: roleColor(r.color), color: roleColor(r.color) }}>{r.name}</span>
                        ))
                      ) : (
                        <span className="hud-label text-muted">{t("setup.noRoles")}</span>
                      )}
                    </span>
                    <span className="hud-label mt-1 block text-accent">{t("setup.access", { level: t(LEVEL_KEY[j.level] ?? "level.basic") })}</span>
                  </span>
                  <span className="text-accent" aria-hidden>▶</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {setup.guilds.length > 0 && (
        <>
      <div className="auth-label">{t("setup.title")}</div>
      <p className="auth-hint mt-0 mb-3">{t("setup.hint", { name: setup.displayName })}</p>
      <ul data-guide="setup-guilds" className="auth-servers scroll-area">
        {setup.guilds.map((g) => (
          <li key={g.id}>
            <button type="button" className="auth-server" disabled={busy} onClick={() => onPick({ guildId: g.id })}>
              {g.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.iconUrl} alt="" width={40} height={40} className="auth-server-icon" />
              ) : (
                <span className="auth-server-icon auth-server-letter">{g.name.charAt(0).toUpperCase()}</span>
              )}
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm text-white">{g.name}</span>
                <span className={`hud-label block ${g.clanId ? "text-accent" : "text-muted"}`}>{g.clanId ? t("setup.linked") : t("setup.newClan")}</span>
              </span>
              <span className="text-accent" aria-hidden>▶</span>
            </button>
          </li>
        ))}
      </ul>
        </>
      )}

      {setup.memberships.length > 0 && (
        <>
          <div className="auth-label mt-4">{t("setup.memberships")}</div>
          <ul data-guide="setup-members" className="auth-servers">
            {setup.memberships.map((m) => (
              <li key={m.clanId}>
                <button type="button" className="auth-server" disabled={busy} onClick={() => onPick({ clanId: m.clanId })}>
                  <span className="auth-server-icon auth-server-letter">{m.clanName.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm text-white">{m.clanName}</span>
                    <span className="hud-label block text-muted">{t(ROLE_KEY[m.role] ?? "role.member")}</span>
                  </span>
                  <span className="text-accent" aria-hidden>▶</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <button type="button" className="btn mt-4 w-full" disabled={busy} data-guide="setup-back" onClick={onCancel}>
        ← {t("setup.back")}
      </button>
    </div>
  );
};
