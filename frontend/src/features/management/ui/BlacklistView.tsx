"use client";

import * as React from "react";
import { EmptyState, Icon, SearchField, errorText, formatDateTime, roleColor, useNotify, useT } from "@/shared";
import { managementApi, type Blacklist, type ClanMember, type DiscordRole } from "@/features/management/api";

type Entry = Blacklist["users"][number];

/**
 * Чёрный список клана (командир): участники по Discord ID и роли Discord. Кто в списке или носит
 * роль из списка — теряет членство, не может вступить снова, его сессия перестаёт действовать.
 */
export const BlacklistView: React.FC = () => {
  const t = useT();
  const notify = useNotify();
  const [list, setList] = React.useState<Blacklist | null>(null);
  const [roles, setRoles] = React.useState<DiscordRole[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [found, setFound] = React.useState<ClanMember[]>([]);
  const [reason, setReason] = React.useState("");
  const [roleId, setRoleId] = React.useState("");

  React.useEffect(() => {
    managementApi.blacklist().then(setList).catch(() => setList({ users: [], roles: [] }));
    managementApi.roles().then((r) => setRoles(r.roles)).catch(() => setRoles([]));
  }, []);

  // поиск участника сервера по нику (на сервере Discord) или ввод Discord ID
  const q = query.trim();
  const byId = /^\d{15,21}$/.test(q);
  React.useEffect(() => {
    setFound([]);
    if (q.length < 2 || byId) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      managementApi.members({ q, limit: 8 }).then((r) => alive && setFound(r.members)).catch(() => alive && setFound([]));
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [q, byId]);

  const save = async (users: Entry[], roleIds: string[]) => {
    setBusy(true);
    try {
      const r = await managementApi.saveBlacklist(users.map((u) => ({ id: u.id, name: u.name, reason: u.reason })), roleIds);
      setList(r.blacklist);
      notify({ title: t("mgmt.blacklist"), message: r.message, tone: "success" });
      return true;
    } catch (err) {
      notify({ title: t("mgmt.blacklist"), message: errorText(err, t("bl.failed")), tone: "danger" });
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!list) return <section className="panel p-5 text-sm text-fg-3">{t("common.loading")}</section>;
  const roleIds = list.roles.map((r) => r.id);

  const addUser = async (id: string, name: string | null) => {
    if (list.users.some((u) => u.id === id)) return;
    const ok = await save([...list.users, { id, name, reason: reason.trim() || null, by: null, at: null }], roleIds);
    if (ok) {
      setQuery("");
      setReason("");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="panel p-5">
        <div className="panel-title">{t("bl.usersTitle")}</div>
        <p className="mt-1 text-sm text-fg-3">{t("bl.usersHint")}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr]">
          <SearchField value={query} onChange={setQuery} placeholder={t("bl.search")} />
          <input className="field" value={reason} maxLength={300} placeholder={t("bl.reason")} onChange={(e) => setReason(e.target.value)} />
        </div>
        {byId ? (
          <button type="button" className="btn btn-danger mt-2" disabled={busy} onClick={() => void addUser(q, null)}>
            <Icon name="close" size={14} />
            {t("bl.addId", { id: q })}
          </button>
        ) : found.length ? (
          <ul className="mt-2 flex flex-col gap-1.5">
            {found.map((m) => (
              <li key={m.id} className="dev-clan">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-fg">{m.name}</span>
                  <span className="block text-xs text-fg-3">{m.roles.map((r) => r.name).join(", ") || m.id}</span>
                </span>
                <button type="button" className="btn btn-danger h-8 min-h-0 px-3 text-sm" disabled={busy || list.users.some((u) => u.id === m.id)} onClick={() => void addUser(m.id, m.name)}>
                  {t("bl.add")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {list.users.length === 0 ? (
          <EmptyState icon="cabinet" title={t("bl.usersEmpty")} />
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {list.users.map((u) => (
              <li key={u.id} className="dev-clan">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-fg">{u.name || u.id}</span>
                  <span className="block text-xs text-fg-3">
                    {u.id}
                    {u.by ? ` · ${t("bl.by", { name: u.by })}` : ""}
                    {u.at ? ` · ${formatDateTime(u.at)}` : ""}
                  </span>
                  {u.reason ? <span className="mt-0.5 block text-sm text-fg-2">{u.reason}</span> : null}
                </span>
                <button type="button" className="btn h-8 min-h-0 px-3 text-sm" disabled={busy} onClick={() => void save(list.users.filter((x) => x.id !== u.id), roleIds)}>
                  {t("bl.remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel p-5">
        <div className="panel-title">{t("bl.rolesTitle")}</div>
        <p className="mt-1 text-sm text-fg-3">{t("bl.rolesHint")}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select className="field flex-1" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">{roles.length ? t("bl.pickRole") : t("bl.noRoles")}</option>
            {roles.filter((r) => !roleIds.includes(r.id)).map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}
          </select>
          <button type="button" className="btn btn-danger" disabled={busy || !roleId} onClick={() => void save(list.users, [...roleIds, roleId]).then((ok) => ok && setRoleId(""))}>
            {t("bl.add")}
          </button>
        </div>
        {list.roles.length === 0 ? (
          <EmptyState icon="guide" title={t("bl.rolesEmpty")} />
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {list.roles.map((r) => (
              <li key={r.id} className="hq-saved">
                <span className="px-2 text-sm" style={{ color: r.color ? roleColor(r.color) : undefined }}>@{r.name}</span>
                <button type="button" className="hq-person-x" aria-label={t("bl.remove")} disabled={busy} onClick={() => void save(list.users, roleIds.filter((x) => x !== r.id))}>
                  <Icon name="close" size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
