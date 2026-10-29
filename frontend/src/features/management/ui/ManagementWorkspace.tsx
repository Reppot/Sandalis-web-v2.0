"use client";

import * as React from "react";
import { EmptyState, LoadMore, Loading, Modal, PagedMore, cn, errorText, formatDateTime, matchesWords, roleColor, useNotify, usePaged, useT, type MessageKey, Icon, PageHeader, SearchField, Segmented } from "@/shared";
import { ClanTokenPanel } from "@/features/management/ui/ClanTokenPanel";
import { DiscordWebhookPanel } from "@/features/management/ui/DiscordWebhookPanel";
import { BlacklistView } from "@/features/management/ui/BlacklistView";
import { AuditView } from "@/features/management/ui/AuditView";
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
const LEVEL_BADGE: Record<string, string> = {
  owner: "badge-accent", high: "badge-danger", medium: "badge-info", custom: "badge-warn", basic: "badge-neutral", guest: "badge-neutral",
};
const hex = roleColor;
const permKey = (p: string) => `perm.${p}` as MessageKey;

type View = "members" | "roles" | "blacklist" | "integrations" | "audit";
const VIEWS: { key: View; label: MessageKey }[] = [
  { key: "members", label: "mgmt.members" },
  { key: "roles", label: "mgmt.roles" },
  { key: "blacklist", label: "mgmt.blacklist" },
  { key: "integrations", label: "mgmt.integrations" },
  { key: "audit", label: "audit.tab" },
];

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
    <div className="tab-fade flex flex-col gap-4">
      <PageHeader icon="map" eyebrow={t("mgmt.kicker")} title={t("nav.management.label")} lead={t("mgmt.subtitle")}>
        <div className="mt-5">
          <Segmented label={t("nav.management.label")} size="lg" value={view} onChange={setView} options={VIEWS.map((v) => ({ value: v.key, label: t(v.label) }))} />
        </div>
      </PageHeader>

      <BotPanel onChanged={() => setRevision((r) => r + 1)} />

      {view === "members" ? (
        <MembersView key={revision} catalog={catalog} />
      ) : view === "roles" ? (
        <RolesView key={revision} catalog={catalog} />
      ) : view === "blacklist" ? (
        <BlacklistView key={revision} />
      ) : view === "audit" ? (
        <AuditView />
      ) : (
        <div data-guide="mgmt-integrations" className="flex flex-col gap-4">
          <DiscordWebhookPanel />
          <ClanTokenPanel />
        </div>
      )}
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
    <section data-guide="mgmt-bot" className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="panel-title">{t("mgmt.botTitle")}</div>
        {data?.guildId && (
          <span className={cn("cabinet-pill", verified && "cabinet-pill-online")}>
            {verified ? t("mgmt.botOnline") : t("mgmt.botOffline")}
            {verified && synced ? ` · ${t("droles.on")} · ${data.roles.length}` : ""}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-fg-3">{t("droles.hint")}</p>

      {!data ? (
        <Loading className="min-h-[90px]" skeleton={false} />
      ) : (
        <>
          <ol className="mt-4 grid gap-2 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.label} className={cn("setup-step", step.done && "is-done")}>
                <span className="setup-step-mark">{step.done ? <Icon name="check" size={13} strokeWidth={3} /> : i + 1}</span>
                <span className="min-w-0 flex-1">{t(step.label)}</span>
              </li>
            ))}
          </ol>

          {!data.guildId ? (
            <p className="mt-4 text-sm text-warn">{t("droles.noGuild")}</p>
          ) : !data.botConfigured ? (
            <p className="mt-4 text-sm text-warn">{t("droles.noBotToken")}</p>
          ) : (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className={cn("flex-1 text-sm", data.botInGuild ? "text-fg-3" : "text-warn")}>
                {!data.botInGuild ? t("droles.addBot") : synced ? t("droles.synced", { at: formatDateTime(data.syncedAt!) }) : t("droles.notSynced")}
              </p>
              {data.botInviteUrl && (
                <a className={cn("btn", !data.botInGuild && "btn-primary")} data-guide="mgmt-add-bot" href={data.botInviteUrl} target="_blank" rel="noreferrer">
                  <Icon name="plus" size={15} />
                  {t(data.botInGuild ? "mgmt.reinviteBot" : "droles.addBotButton")}
                </a>
              )}
              {data.botInGuild && (
                <button type="button" className="btn btn-primary" data-guide="mgmt-pull" disabled={busy} onClick={() => void pull()}><Icon name="download" size={15} />{t("droles.pull")}</button>
              )}
              <button type="button" className="btn" disabled={busy} onClick={load}><Icon name="refresh" size={15} />{t("common.sync")}</button>
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
    return list.filter((m) => matchesWords(`${m.name} ${m.roles.map((r) => r.name).join(" ")}`, q));
  }, [current, q, searching]);
  const total = catalog ? catalog.groups.reduce((n, g) => n + g.permissions.length, 0) : 0;

  return (
    <section data-guide="mgmt-members" className="panel p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <h2 className="flex flex-1 flex-wrap items-baseline gap-x-2.5">
          <span className="panel-title">{t("mgmt.members")}</span>
          {data ? <span className="count-pill">{data.total ?? data.members.length}</span> : null}
          {data ? <span className="text-xs text-safe">{t("mgmt.joinedTotal", { n: data.joinedTotal })}</span> : null}
        </h2>
        <SearchField className="w-full sm:w-72" placeholder={t("mgmt.search")} value={query} onChange={setQuery} />
        <button type="button" className="btn h-10" onClick={load}><Icon name="refresh" size={15} />{t("common.sync")}</button>
      </div>
      {data?.status === "intent_required" && <p className="mt-3 text-sm text-warn">{t("droles.membersIntent")}</p>}
      {data?.status === "no_bot" && <p className="mt-3 text-sm text-warn">{t("mgmt.noBotMembers")}</p>}
      {data?.status === "no_guild" && <p className="mt-3 text-sm text-warn">{t("droles.noGuild")}</p>}

      {!current ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState icon="cabinet" title={t("mgmt.noMembers")} />
      ) : (
        <ul className="mt-4 flex flex-col gap-1.5">
          {filtered.map((m) => {
            const expanded = open === m.id;
            return (
              <li key={m.id} className={cn("member-row", !m.joined && "opacity-70")}>
                <button type="button" className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 text-left" onClick={() => setOpen(expanded ? null : m.id)}>
                  <Icon name="chevronRight" size={15} className={cn("text-fg-3 transition-transform", expanded && "rotate-90")} />
                  <span className="min-w-[10rem] flex-1 truncate text-[0.9rem] font-medium text-fg">{m.name}</span>
                  <span className="flex min-w-0 flex-[2] flex-wrap gap-1">
                    {m.roles.length ? (
                      m.roles.map((r) => (
                        <span key={r.name} className="auth-role-chip" style={{ borderColor: hex(r.color), color: hex(r.color) }}>{r.name}</span>
                      ))
                    ) : (
                      <span className="text-xs text-fg-3">{t(m.inDiscord ? "setup.noRoles" : "mgmt.notOnServer")}</span>
                    )}
                  </span>
                  <span className={cn("badge", LEVEL_BADGE[m.level] ?? "badge-neutral")}>
                    {t(LEVEL_LABEL[m.level] ?? "level.basic")}
                  </span>
                  <span className={cn("w-28 text-right text-xs", m.joined ? "text-safe" : "text-fg-3")}>{t(m.joined ? "droles.joined" : "droles.notJoined")}</span>
                </button>
                {expanded && (
                  <div className="mt-3 border-t border-line pt-3">
                    <div className="mb-2 text-xs text-fg-3">
                      {t("mgmt.effective")} · {m.permissions.includes("*") ? t("mgmt.allPermissions") : `${m.permissions.length} / ${total}`}
                    </div>
                    {!m.permissions.includes("*") && (
                      <div className="flex flex-wrap gap-1">
                        {m.permissions.map((p) => (
                          <span key={p} className="badge badge-neutral">{t(permKey(p))}</span>
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
  // «мусорные» роли: отметить и убрать с сайта (с подтверждением фразой)
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [confirming, setConfirming] = React.useState(false);

  const apply = (d: DiscordRoles) => {
    setData(d);
    setLevels(Object.fromEntries(d.roles.map((r) => [r.id, r.level])));
    setPerms(Object.fromEntries(d.roles.filter((r) => r.level === "custom").map((r) => [r.id, r.permissions])));
    setDirty(false);
    setPicked(new Set());
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
    <section data-guide="mgmt-roles" className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="panel-title">{t("mgmt.roles")}</h2>
        {data?.guildId && (
          <span className={cn("cabinet-pill", synced && "cabinet-pill-online")}>
            {synced ? `${t("droles.on")} · ${data.roles.length}` : t("droles.off")}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-fg-3">{t("mgmt.rolesHint")}</p>

      {!data ? (
        <Loading />
      ) : !synced ? (
        <p className="mt-4 text-sm text-warn">{t("mgmt.connectFirst")}</p>
      ) : (
        <>
          {synced && (
            <>
              <p className="mt-3 text-xs leading-relaxed text-fg-3">{t("droles.levelsHelp")} {t("mgmt.customHelp")}</p>
              {data.roles.length === 0 ? (
                <p className="mt-3 text-sm text-fg-3">{t("droles.empty")}</p>
              ) : (
                <ul className="mt-4 grid gap-1.5 lg:grid-cols-2">
                  {rolesPage.items.map((role) => {
                    const level = levels[role.id] ?? "basic";
                    return (
                      <li key={role.id} className={cn("member-row flex items-center gap-2.5 py-1.5 text-sm", picked.has(role.id) && "is-picked")}>
                        <input
                          type="checkbox"
                          className="role-pick"
                          checked={picked.has(role.id)}
                          aria-label={t("droles.pick", { role: role.name })}
                          title={t("droles.pick", { role: role.name })}
                          onChange={(e) => setPicked((prev) => { const next = new Set(prev); if (e.target.checked) next.add(role.id); else next.delete(role.id); return next; })}
                        />
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: hex(role.color) }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-fg">{role.name}</span>
                        <select className="field h-9 min-h-0 w-44 py-0 text-[0.8rem]" data-guide="mgmt-level" value={level} onChange={(e) => setLevel(role, e.target.value as AccessLevel)}>
                          {LEVELS.map((o) => (
                            <option key={o.value} value={o.value}>{t(o.label)}</option>
                          ))}
                        </select>
                        {level === "custom" ? (
                          <button type="button" className="btn h-9 min-h-0 px-2.5" data-guide="mgmt-gear" title={t("mgmt.configure")} aria-label={t("mgmt.configure")} onClick={() => setEditing(role)}>
                            <Icon name="key" size={14} />
                            <span className="text-xs">{perms[role.id]?.length ?? 0}</span>
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
              {picked.size ? (
                <div className="hq-bulk mt-3">
                  <b className="text-sm">{t("hq.bulk.selected", { n: picked.size })}</b>
                  <button type="button" className="btn btn-danger h-8 min-h-0 px-3 text-sm" disabled={busy} onClick={() => setConfirming(true)}>
                    <Icon name="trash" size={14} />
                    {t("droles.hide")}
                  </button>
                  <button type="button" className="btn h-8 min-h-0 px-2.5 text-sm" onClick={() => setPicked(new Set())}><Icon name="close" size={13} />{t("hq.bulk.clear")}</button>
                </div>
              ) : null}
              {data.hidden.length ? (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-fg-3">{t("droles.hiddenTitle", { n: data.hidden.length })}</summary>
                  <p className="mt-1 text-xs text-fg-3">{t("droles.hiddenHint")}</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {data.hidden.map((h) => (
                      <li key={h.id} className="hq-saved">
                        <span className="px-2 text-sm text-fg-2">@{h.name}</span>
                        <button type="button" className="hq-person-x" title={t("droles.unhide")} aria-label={t("droles.unhide")} disabled={busy} onClick={() => void act(() => managementApi.unhide(h.id))}>
                          <Icon name="close" size={11} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <div className="mt-3 flex items-center justify-end gap-2">
                {dirty && <span className="text-xs text-warn">{t("mgmt.unsaved")}</span>}
                <button type="button" className="btn btn-primary" data-guide="mgmt-save" disabled={busy || !dirty} onClick={() => void act(() => managementApi.save(levels, perms))}>
                  {t("common.save")}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {confirming && data ? (
        <HideRolesModal
          roles={data.roles.filter((r) => picked.has(r.id))}
          busy={busy}
          onClose={() => setConfirming(false)}
          onConfirm={() => void act(() => managementApi.hide([...picked])).then(() => setConfirming(false))}
        />
      ) : null}

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
        <span className="text-xs text-fg-3">{t("mgmt.fromPreset")}</span>
        {(["basic", "medium", "high"] as const).map((lv) => (
          <button key={lv} type="button" className="chip" onClick={() => setSelected(new Set(catalog.presets[lv]))}>{t(LEVEL_LABEL[lv])}</button>
        ))}
        <button type="button" className="chip" onClick={() => setSelected(new Set(all))}>{t("mgmt.selectAll")}</button>
        <button type="button" className="chip text-danger" onClick={() => setSelected(new Set())}>{t("mgmt.selectNone")}</button>
        <span className="count-pill ml-auto">{selected.size} / {all.length}</span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {catalog.groups.map((group) => (
          <fieldset key={group.key} className="panel-inner p-3.5" data-guide="mgmt-perm-group">
            <legend className="px-1 text-xs font-semibold text-fg-2">{t(`permGroup.${group.key}` as MessageKey)}</legend>
            {group.permissions.map((p) => (
              <label key={p} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 text-[0.85rem] text-fg hover:bg-[var(--surface-hover)]">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={selected.has(p)} onChange={() => toggle(p)} />
                <span>
                  {t(permKey(p))}
                  <span className="block font-mono text-[0.7rem] text-fg-3">{p}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </Modal>
  );
};

/** Подтверждение: убрать роли с сайта — только после ввода фразы. */
const HideRolesModal: React.FC<{ roles: DiscordRole[]; busy: boolean; onClose: () => void; onConfirm: () => void }> = ({ roles, busy, onClose, onConfirm }) => {
  const t = useT();
  const [typed, setTyped] = React.useState("");
  const phrase = t("droles.hidePhrase");
  const ok = typed.trim().toLowerCase() === phrase.toLowerCase();
  return (
    <Modal
      open
      onClose={onClose}
      title={t("droles.hideTitle", { n: roles.length })}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-danger" disabled={!ok || busy} onClick={onConfirm}>{t("droles.hide")}</button>
        </>
      }
    >
      <p className="text-sm text-fg-2">{t("droles.hideText")}</p>
      <ul className="mt-3 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
        {roles.map((r) => (
          <li key={r.id} className="badge badge-neutral" style={{ color: r.color ? hex(r.color) : undefined }}>@{r.name}</li>
        ))}
      </ul>
      <label className="mt-4 flex flex-col gap-1">
        <span className="text-sm text-fg-2">{t("droles.hideType", { phrase })}</span>
        <input className="field" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ok && !busy && onConfirm()} placeholder={phrase} />
      </label>
    </Modal>
  );
};
