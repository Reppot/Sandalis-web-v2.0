"use client";

import * as React from "react";
import { EmptyState, Loading, apiClient, cn, errorText, formatDateTime, useNotify, useT, type MessageKey } from "@/shared";

interface Entry {
  id: string;
  at: string;
  actor_id: string;
  actor_name: string;
  developer: boolean;
  action: string;
  details: Record<string, unknown>;
}

const show = (v: unknown): string =>
  Array.isArray(v) ? v.join(", ") : v && typeof v === "object" ? Object.entries(v).map(([k, x]) => `${k}: ${show(x)}`).join("; ") : String(v);

/** Журнал чувствительных действий клана: роли, чёрный список, настройки, токены, удаления, входы разработчика. */
export const AuditView: React.FC = () => {
  const t = useT();
  const notify = useNotify();
  const [rows, setRows] = React.useState<Entry[] | null>(null);

  React.useEffect(() => {
    apiClient.get<Entry[]>("/api/v1/clan/audit").then(setRows).catch((err) => {
      setRows([]);
      notify({ title: t("audit.title"), message: errorText(err, t("mgmt.loadFailed")), tone: "danger" });
    });
  }, [notify, t]);

  return (
    <section className="panel p-5">
      <h2 className="panel-title">{t("audit.title")}</h2>
      <p className="mt-1 text-sm text-fg-3">{t("audit.hint")}</p>
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState icon="document" title={t("audit.empty")} />
      ) : (
        <ol className="mt-4 flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.id} className={cn("member-row flex flex-col gap-0.5 py-2 text-sm", r.developer && "is-picked")}>
              <span className="flex flex-wrap items-baseline gap-x-2">
                <b className="font-semibold text-fg">{r.actor_name}</b>
                {r.developer ? <span className="badge badge-warn">{t("dev.badge")}</span> : null}
                <span className="text-fg-2">{t(`audit.action.${r.action}` as MessageKey)}</span>
                <span className="ml-auto text-xs text-fg-3">{formatDateTime(r.at)}</span>
              </span>
              {Object.keys(r.details).length ? (
                <span className="text-xs text-fg-3">{Object.entries(r.details).map(([k, v]) => `${k}: ${show(v)}`).join(" · ")}</span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
