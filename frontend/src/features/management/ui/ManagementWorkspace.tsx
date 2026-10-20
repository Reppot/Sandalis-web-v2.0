"use client";

import * as React from "react";
import { EmptyState, LoadMore, Loading, Modal, PagedMore, UiGlyph, cn, errorText, formatDateTime, roleColor, useNotify, usePaged, useT, type MessageKey } from "@/shared";
import { MEMBERS_PAGE, managementApi, type AccessLevel, type ClanMember, type DiscordRole, type DiscordRoles, type MembersPage, type PermissionCatalog } from "@/features/management/api";

const LEVELS: { value: AccessLevel; label: MessageKey }[] = [
  { value: "basic", label: "level.basic" },
  { value: "medium", label: "level.medium" },
  { value: "high", label: "level.high" },
  { value: "custom", label: "level.custom" },
];
const LEVEL_LABEL: Record<string, MessageKey> = {
  basic: "level.basic", medium: "level.medium", high: "level.high", custom: "level.custom", owner: "role.owner", guest: "role.guest",
};
const LEVEL_COLOR: Record<string, string> = {
  owner: "var(--accent)", high: "#f472b6", medium: "#60a5fa", custom: "#fbbf24", basic: "rgba(229,231,235,0.75)", guest: "var(--muted)",
};
const hex = roleColor;
const permKey = (p: string) => `perm.${p}` as MessageKey;

type View = "members" | "roles";

/** «Управление» (только командир): участники клана и роли Discord с уровнями и правами. */
export const ManagementWorkspace: React.FC = () => {
  const t = useT();
  const [view, setView] = React.useState<View>("members");
  const [catalog, setCatalog] = React.useState<PermissionCatalog | null>(null);
  // после «Подтянуть роли» окна участников и ролей перечитываются
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    managementApi.permissions().then(setCatalog).catch(() => setCatalog(null));
  }, []);

  return (
    <div className="tab-fade flex flex-col gap-3">
      <section className="panel panel-corners rounded-md p-4">
        <div className="flex flex-wrap items-center gap-3">
          <UiGlyph icon="map" size={40} />
          <div className="min-w-0 flex-1">
            <div className="hud-label text-muted">{t("mgmt.kicker")}</div>
            <h1 className="panel-title mt-1 text-[1rem] md:text-[1.2rem]">{t("nav.management.label")}</h1>
            <p className="mt-1 text-[0.8rem] text-white/70">{t("mgmt.subtitle")}</p>
          </div>
        </div>
        <div className="stencil-line mt-3" />
        <div className="mt-3 flex gap-1.5" role="tablist">
          {(["members", "roles"] as View[]).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={cn("chip h-9 px-4", view === v && "is-active")} onClick={() => setView(v)}>
              {t(v === "members" ? "mgmt.members" : "mgmt.roles")}
            </button>
          ))}
        </div>
      </section>

      <BotPanel onChanged={() => setRevision((r) => r + 1)} />

      {view === "members" ? <MembersView key={revision} catalog={catalog} /> : <RolesView key={revision} catalog={catalog} />}
    </div>
  );
};

// --------------------------------------------------------------------------- //
// Бот клана на сервере: подключение и роли сервера
// --------------------------------------------------------------------------- //
const BotPanel: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const t = useT();
  const notify = useNotify();
  const [data, setData] = React.useState<DiscordRoles | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    setData(null);
    managementApi
      .roles()
      .then(setData)
      .catch((err) => notify({ title: "DISCORD", message: errorText(err, t("droles.loadFailed")), tone: "danger" }));
  }, [notify, t]);
  React.useEffect(load, [load]);

  const pull = async () => {
    setBusy(true);
    try {
      const r = await managementApi.pull();
      setData(r.roles);
      notify({ title: "DISCORD", message: r.message, tone: "success" });
      onChanged();
    } catch (err) {
      notify({ title: "DISCORD", message: errorText(err, t("droles.saveFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const synced = Boolean(data?.syncedAt);
  // ✔ только после живой проверки: бот видит именно сервер этого клана
  const verified = Boolean(data?.guildId && data.botConfigured && data.botInGuild);
  const steps: { done: boolean; label: MessageKey }[] = data
    ? [
        { done: verified, label: "mgmt.stepGuild" },
        { done: verified, label: "mgmt.stepBot" },
        { done: verified && synced, label: "mgmt.stepRoles" },
      ]
    : [];

  return (
    <section data-guide="mgmt-bot" className="panel panel-corners rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="panel-title">🤖 {t("mgmt.botTitle")}</div>
        {data?.guildId && (
          <span className={cn("cabinet-pill", verified && "cabinet-pill-online")}>
            {verified ? `● ${t("mgmt.botOnline")}` : `○ ${t("mgmt.botOffline")}`}
            {verified && synced ? ` • ${t("droles.on")} • ${data.roles.length}` : ""}
          </span>
        )}
      </div>
      <div className="cabinet-rule" />
      <p className="text-[0.78rem] text-white/70">{t("droles.hint")}</p>

      {!data ? (
        <Loading className="min-h-[90px]" />
      ) : (
        <>
          <ol className="mt-3 grid gap-1.5 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.label} className={cn("row-item text-xs", step.done ? "text-safe" : "text-muted")}>
                <span className="font-mono">{step.done ? "✔" : `${i + 1}.`}</span>
                <span className="min-w-0 flex-1">{t(step.label)}</span>
              </li>
            ))}
          </ol>

          {!data.guildId ? (
            <p className="hud-label mt-3 text-warn">{t("droles.noGuild")}</p>
          ) : !data.botConfigured ? (
            <p className="hud-label mt-3 text-warn">{t("droles.noBotToken")}</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className={cn("hud-label flex-1", data.botInGuild ? "text-muted" : "text-warn")}>
                {!data.botInGuild ? t("droles.addBot") : synced ? t("droles.synced", { at: formatDateTime(data.syncedAt!) }) : t("droles.notSynced")}
              </p>
              {data.botInviteUrl && (
                <a className={cn("btn", !data.botInGuild && "btn-primary")} data-guide="mgmt-add-bot" href={data.botInviteUrl} target="_blank" rel="noreferrer">
                  ＋ {t(data.botInGuild ? "mgmt.reinviteBot" : "droles.addBotButton")}
                </a>
              )}
              {data.botInGuild && (
                <button type="button" className="btn btn-primary" data-guide="mgmt-pull" disabled={busy} onClick={() => void pull()}>⇩ {t("droles.pull")}</button>
              )}
              <button type="button" className="btn" disabled={busy} onClick={load}>⟳ {t("common.sync")}</button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

// --------------------------------------------------------------------------- //
// Участники
// --------------------------------------------------------------------------- //
const MembersView: React.FC<{ catalog: PermissionCatalog | null }> = ({ catalog }) => {
  const t = useT();
  const notify = useNotify();
  // список приходит страницами по MEMBERS_PAGE: на сервере может быть 10 000 человек.
  // Поиск (ник или роль) тоже идёт на сервере по всем участникам и тоже постранично.
  const [data, setData] = React.useState<MembersPage | null>(null);
  const [found, setFound] = React.useState<MembersPage | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);
  const q = query.trim();
  const searching = q.length >= 2;
  const fail = React.useCallback(
    (err: unknown) => notify({ title: t("nav.management.label"), message: errorText(err, t("mgmt.loadFailed")), tone: "danger" }),
    [notify, t],
  );

  const load = React.useCallback(() => {
    setData(null);
    managementApi.members().then(setData).catch(fail);
  }, [fail]);
  React.useEffect(load, [load]);

  React.useEffect(() => {
    setFound(null);
    if (!searching) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      managementApi.members({ q }).then((r) => alive && setFound(r)).catch((err) => alive && fail(err));
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [q, searching, fail]);

  const current = searching ? found : data;
  const loadMore = async () => {
    if (!current?.nextAfter) return;
    const set = searching ? setFound : setData;
    setLoadingMore(true);
    try {
      const next = await managementApi.members({ after: current.nextAfter, q: searching ? q : undefined });
      set((prev) => prev && {
        ...next,
        total: prev.total,
        joinedTotal: prev.joinedTotal,
        members: [...prev.members, ...next.members.filter((m) => !prev.members.some((p) => p.id === m.id))],
      });
    } catch (err) {
      fail(err);
    } finally {
      setLoadingMore(false);
    }
  };

  // 1 символ — мгновенный фильтр по загруженным; от 2 — поиск по всему серверу
  const filtered = React.useMemo(() => {
    const list = current?.members ?? [];
    if (!q || searching) return list;
    const needle = q.toLowerCase();
    return list.filter((m) => `${m.name} ${m.roles.map((r) => r.name).join(" ")}`.toLowerCase().includes(needle));
  }, [current, q, searching]);
  const total = catalog ? catalog.groups.reduce((n, g) => n + g.permissions.length, 0) : 0;

  return (
    <section data-guide="mgmt-members" className="panel panel-corners rounded-md p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <h2 className="panel-title flex-1">
          👥 {t("mgmt.members")}{data ? ` • ${data.total ?? data.members.length}` : ""}
          {data ? <span className="hud-label ml-2 text-safe">{t("mgmt.joinedTotal", { n: data.joinedTotal })}</span> : null}
        </h2>
        <input className="field field-mono w-full py-1.5 text-xs sm:w-64" placeholder={t("mgmt.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="btn" onClick={load}>⟳ {t("common.sync")}</button>
      </div>
      {data?.status === "intent_required" && <p className="hud-label mt-2 text-warn">{t("droles.membersIntent")}</p>}
      {data?.status === "no_bot" && <p className="hud-label mt-2 text-warn">{t("mgmt.noBotMembers")}</p>}
      {data?.status === "no_guild" && <p className="hud-label mt-2 text-warn">{t("droles.noGuild")}</p>}

      {!current ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState icon="cabinet" title={t("mgmt.noMembers")} />
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {filtered.map((m) => {
            const expanded = open === m.id;
            return (
              <li key={m.id} className={cn("panel-inner rounded px-3 py-2", !m.joined && "opacity-75")}>
                <button type="button" className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 text-left" onClick={() => setOpen(expanded ? null : m.id)}>
                  <span className="text-white/50" aria-hidden>{expanded ? "▾" : "▸"}</span>
                  <span className="min-w-[10rem] flex-1 truncate text-sm text-white">{m.name}</span>
                  <span className="flex min-w-0 flex-[2] flex-wrap gap-1">
                    {m.roles.length ? (
                      m.roles.map((r) => (
                        <span key={r.name} className="auth-role-chip" style={{ borderColor: hex(r.color), color: hex(r.color) }}>{r.name}</span>
                      ))
                    ) : (
                      <span className="hud-label text-muted">{t(m.inDiscord ? "setup.noRoles" : "mgmt.notOnServer")}</span>
                    )}
                  </span>
                  <span className="hud-label rounded border px-1.5 py-0.5" style={{ color: LEVEL_COLOR[m.level], borderColor: LEVEL_COLOR[m.level] }}>
                    {t(LEVEL_LABEL[m.level] ?? "level.basic")}
                  </span>
                  <span className={cn("hud-label w-28 text-right", m.joined ? "text-safe" : "text-muted")}>{t(m.joined ? "droles.joined" : "droles.notJoined")}</span>
                </button>
                {expanded && (
                  <div className="mt-2 border-t border-white/10 pt-2">
                    <div className="hud-label mb-1.5 text-muted">
                      {t("mgmt.effective")} • {m.permissions.includes("*") ? t("mgmt.allPermissions") : `${m.permissions.length} / ${total}`}
                    </div>
                    {!m.permissions.includes("*") && (
                      <div className="flex flex-wrap gap-1">
                        {m.permissions.map((p) => (
                          <span key={p} className="badge-count min-w-0 px-2 text-[0.62rem] normal-case">{t(permKey(p))}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {current && (
        <LoadMore
          shown={current.members.length}
          total={searching ? (current.nextAfter ? null : current.members.length) : current.total}
          next={current.nextAfter ? MEMBERS_PAGE : 0}
          onMore={() => void loadMore()}
          busy={loadingMore}
        />
      )}
    </section>
  );
};

// --------------------------------------------------------------------------- //
// Роли и доступ
// --------------------------------------------------------------------------- //
const RolesView: React.FC<{ catalog: PermissionCatalog | null }> = ({ catalog }) => {
  const t = useT();
  const notify = useNotify();
  const [data, setData] = React.useState<DiscordRoles | null>(null);
  const [levels, setLevels] = React.useState<Record<string, AccessLevel>>({});
  const [perms, setPerms] = React.useState<Record<string, string[]>>({});
  const [editing, setEditing] = React.useState<DiscordRole | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  const apply = (d: DiscordRoles) => {
    setData(d);
    setLevels(Object.fromEntries(d.roles.map((r) => [r.id, r.level])));
    setPerms(Object.fromEntries(d.roles.filter((r) => r.level === "custom").map((r) => [r.id, r.permissions])));
    setDirty(false);
  };

  const load = React.useCallback(() => {
    setData(null);
    managementApi
      .roles()
      .then(apply)
      .catch((err) => notify({ title: "DISCORD", message: errorText(err, t("droles.loadFailed")), tone: "danger" }));
  }, [notify, t]);
  React.useEffect(load, [load]);

  const act = async (action: () => Promise<{ roles: DiscordRoles; message: string }>) => {
    setBusy(true);
    try {
      const r = await action();
      apply(r.roles);
      notify({ title: "DISCORD", message: r.message, tone: "success" });
    } catch (err) {
      notify({ title: "DISCORD", message: errorText(err, t("droles.saveFailed")), tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const setLevel = (role: DiscordRole, level: AccessLevel) => {
    setLevels((prev) => ({ ...prev, [role.id]: level }));
    setDirty(true);
    if (level === "custom" && !perms[role.id]) {
      // кастомный доступ стартует с прав текущего пресета роли
      const from = levels[role.id];
      const base = from && from !== "custom" && catalog ? catalog.presets[from] : catalog?.presets.basic ?? [];
      setPerms((prev) => ({ ...prev, [role.id]: [...base] }));
      setEditing(role);
    }
  };

  const synced = Boolean(data?.syncedAt);
  const rolesPage = usePaged(data?.roles ?? [], 60);

  return (
    <section data-guide="mgmt-roles" className="panel panel-corners rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="panel-title">🛡 {t("mgmt.roles")}</h2>
        {data?.guildId && (
          <span className={cn("cabinet-pill", synced && "cabinet-pill-online")}>
            {synced ? `● ${t("droles.on")} • ${data.roles.length}` : `○ ${t("droles.off")}`}
          </span>
        )}
      </div>
      <p className="mt-2 text-[0.78rem] text-white/70">{t("mgmt.rolesHint")}</p>

      {!data ? (
        <Loading />
      ) : !synced ? (
        <p className="hud-label mt-3 text-warn">{t("mgmt.connectFirst")}</p>
      ) : (
        <>
          {synced && (
            <>
              <p className="hud-label mt-3 text-muted">{t("droles.levelsHelp")} {t("mgmt.customHelp")}</p>
              {data.roles.length === 0 ? (
                <p className="hud-label mt-3 text-muted">{t("droles.empty")}</p>
              ) : (
                <ul className="mt-2 grid gap-1.5 lg:grid-cols-2">
                  {rolesPage.items.map((role) => {
                    const level = levels[role.id] ?? "basic";
                    return (
                      <li key={role.id} className="row-item flex items-center gap-2 text-xs">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: hex(role.color) }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-white">{role.name}</span>
                        <select className="field w-44 py-1 text-xs" data-guide="mgmt-level" value={level} onChange={(e) => setLevel(role, e.target.value as AccessLevel)}>
                          {LEVELS.map((o) => (
                            <option key={o.value} value={o.value}>{t(o.label)}</option>
                          ))}
                        </select>
                        {level === "custom" ? (
                          <button type="button" className="btn px-2 py-1" data-guide="mgmt-gear" title={t("mgmt.configure")} aria-label={t("mgmt.configure")} onClick={() => setEditing(role)}>
                            ⚙ <span className="hud-label">{perms[role.id]?.length ?? 0}</span>
                          </button>
                        ) : (
                          <span className="w-[3.25rem]" />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <PagedMore page={rolesPage} />
              <div className="mt-3 flex items-center justify-end gap-2">
                {dirty && <span className="hud-label text-warn">{t("mgmt.unsaved")}</span>}
                <button type="button" className="btn btn-primary" data-guide="mgmt-save" disabled={busy || !dirty} onClick={() => void act(() => managementApi.save(levels, perms))}>
                  {t("common.save")}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {editing && catalog && (
        <RolePermissionsModal
          role={editing}
          catalog={catalog}
          value={perms[editing.id] ?? []}
          onClose={() => setEditing(null)}
          onApply={(next) => {
            setPerms((prev) => ({ ...prev, [editing.id]: next }));
            setDirty(true);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
};

/** Окно роли: права на каждое действие сайта. */
const RolePermissionsModal: React.FC<{
  role: DiscordRole;
  catalog: PermissionCatalog;
  value: string[];
  onClose: () => void;
  onApply: (permissions: string[]) => void;
}> = ({ role, catalog, value, onClose, onApply }) => {
  const t = useT();
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(value));
  const toggle = (p: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  const all = catalog.groups.flatMap((g) => g.permissions);

  return (
    <Modal
      open
      onClose={onClose}
      title={t("mgmt.roleTitle", { role: role.name })}
      icon="cabinet"
      widthClass="max-w-3xl"
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn btn-primary" data-guide="mgmt-apply" onClick={() => onApply(all.filter((p) => selected.has(p)))}>{t("mgmt.apply")}</button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="hud-label text-muted">{t("mgmt.fromPreset")}:</span>
        {(["basic", "medium", "high"] as const).map((lv) => (
          <button key={lv} type="button" className="btn px-2 py-1 text-[0.65rem]" onClick={() => setSelected(new Set(catalog.presets[lv]))}>{t(LEVEL_LABEL[lv])}</button>
        ))}
        <button type="button" className="btn px-2 py-1 text-[0.65rem]" onClick={() => setSelected(new Set(all))}>{t("mgmt.selectAll")}</button>
        <button type="button" className="btn btn-danger px-2 py-1 text-[0.65rem]" onClick={() => setSelected(new Set())}>{t("mgmt.selectNone")}</button>
        <span className="hud-label ml-auto text-accent">{selected.size} / {all.length}</span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {catalog.groups.map((group) => (
          <fieldset key={group.key} className="panel-inner rounded p-3" data-guide="mgmt-perm-group">
            <legend className="hud-label px-1 text-accent">{t(`permGroup.${group.key}` as MessageKey)}</legend>
            {group.permissions.map((p) => (
              <label key={p} className="flex cursor-pointer items-start gap-2 py-1 text-[0.8rem] text-white/90">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" checked={selected.has(p)} onChange={() => toggle(p)} />
                <span>
                  {t(permKey(p))}
                  <span className="hud-label block text-muted normal-case">{p}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </Modal>
  );
};
