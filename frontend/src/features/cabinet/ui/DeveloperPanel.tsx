"use client";

import * as React from "react";
import { authApi, type DeveloperClan } from "@/features/cabinet/api/authApi";
import { EmptyState, Icon, assetUrl, cn, errorText, useNotify, useT } from "@/shared";

/**
 * Разработчик сайта (Discord ID в FEEDBACK_ADMIN_IDS): все кланы и вход в любой с правами
 * командира — «Управление», роли и доступ, интеграции. Вход пишется в журнал сервера.
 */
export const DeveloperPanel: React.FC<{ currentClan: string; developer: boolean }> = ({ currentClan, developer }) => {
  const t = useT();
  const notify = useNotify();
  const [clans, setClans] = React.useState<DeveloperClan[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    authApi.developerClans().then(setClans).catch(() => setClans([]));
  }, []);

  const enter = async (clan: DeveloperClan) => {
    setBusy(clan.id);
    try {
      await authApi.enterClan(clan.id);
      // новая сессия — новый клан: перезагрузка сбрасывает данные прежнего
      window.location.href = "/?tab=clan&view=management";
    } catch (err) {
      notify({ title: t("dev.failed"), message: errorText(err, t("dev.failed")), tone: "danger" });
      setBusy(null);
    }
  };

  const q = query.trim().toLowerCase();
  const shown = (clans ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.includes(q));

  return (
    <section className="panel p-5">
      <div className="panel-title">{t("dev.title")}</div>
      <p className="mt-1 text-sm text-fg-3">{t("dev.hint")}</p>
      <input className="field mt-4" value={query} placeholder={t("dev.search")} onChange={(e) => setQuery(e.target.value)} />
      {clans === null ? (
        <p className="mt-4 text-sm text-fg-3">{t("common.loading")}</p>
      ) : shown.length === 0 ? (
        <EmptyState icon="search" title={t("dev.search")} />
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {shown.map((c) => {
            const icon = assetUrl(c.icon_url);
            // свой клан тоже можно открыть с правами командира, если вы в нём обычным участником
            const here = c.id === currentClan && developer;
            return (
              <li key={c.id} className={cn("dev-clan", here && "is-current")}>
                {icon ? (
                  // eslint-disable-next-line @next/next/no-img-element -- иконка сервера Discord
                  <img src={icon} alt="" width={36} height={36} className="dev-clan-icon" />
                ) : (
                  <span className="dev-clan-icon"><Icon name="shield" size={16} /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-fg">{c.name}</span>
                  <span className="block text-xs text-fg-3">
                    {t("dev.members", { n: c.members })}
                    {c.discord_linked ? "" : ` · ${t("dev.noDiscord")}`}
                  </span>
                </span>
                {here ? (
                  <span className="text-xs text-fg-3">{t("dev.current")}</span>
                ) : (
                  <button type="button" className="btn h-8 min-h-0 px-3 text-sm" disabled={busy !== null} onClick={() => void enter(c)}>
                    <Icon name="external" size={14} />
                    {busy === c.id ? t("common.loading") : t("dev.enter")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
