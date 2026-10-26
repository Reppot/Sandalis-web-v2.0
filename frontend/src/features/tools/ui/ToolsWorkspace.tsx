"use client";

import * as React from "react";
import { useContent, type ExternalToolPayload } from "@/entities/content";
import { recipeApi, type Recipe } from "@/entities/recipe";
import { LOCALES, Loading, STORAGE_KEYS, errorText, readStorage, UiGlyph, cn, useNotify, useT, writeStorage, type MessageKey, type UiIcon } from "@/shared";
import { FactoryCalculator } from "@/features/tools/ui/FactoryCalculator";
import { RefineryCalculator } from "@/features/tools/ui/RefineryCalculator";
import { FacilityCalculator } from "@/features/tools/ui/FacilityCalculator";

/** Модуль терминала на витрине «Инструментов». render — содержимое модуля (из page.tsx: Заказы, Пирамида, Коды). */
export interface ToolModule {
  id: string;
  icon: UiIcon;
  label: MessageKey;
  render?: () => React.ReactNode;
  /** Работает на данных клана (склады, рапорты) — показываем бейдж. */
  clanData?: boolean;
  isNew?: boolean;
}

/** Калькуляторы — модули без данных клана; page.tsx показывает их и в боковом меню. */
export const TOOL_CALCULATORS: ToolModule[] = [
  { id: "facility", icon: "facility", label: "tools.facility", isNew: true },
  { id: "mpf", icon: "mpf", label: "tools.mpf" },
  { id: "factory", icon: "factory", label: "tools.factory" },
  { id: "refinery", icon: "refinery", label: "tools.refinery" },
];

const card = (id: string, key: "tagline" | "f1" | "f2" | "f3") => `tools.card.${id}.${key}` as MessageKey;

/**
 * «Инструменты» — главная витрина терминала: крупные карточки модулей (заказы, пирамида,
 * база кодов, калькуляторы), под ними — компактные ссылки на сторонние сервисы.
 * Открытый модуль управляется снаружи (active/onOpen) — он живёт в адресе страницы.
 */
export const ToolsWorkspace: React.FC<{
  modules: ToolModule[];
  active: string | null;
  onOpen: (id: string | null) => void;
  /** Можно отправлять заказы клана (reports:create) — кнопка в калькуляторе завода. */
  canSendOrders?: boolean;
  onOrderSent?: () => void;
  /** Сводка клана под шапкой витрины (собирает page.tsx). */
  summary?: React.ReactNode;
  /** Карточка «С чего начать» для новичков (собирает page.tsx). */
  welcome?: React.ReactNode;
  /** Имя для приветствия; null — гость. */
  userName?: string | null;
}> = ({ modules, active, onOpen, canSendOrders, onOrderSent, summary, welcome, userName }) => {
  const notify = useNotify();
  const t = useT();
  const { list } = useContent();
  const [recipes, setRecipes] = React.useState<{ factory: Recipe[]; refinery: Recipe[] } | null>(null);
  // рецепты построек (~350) грузятся только при открытии калькулятора завода
  const [facility, setFacility] = React.useState<Recipe[] | null>(null);
  const external = list<ExternalToolPayload>("external_tool");
  const all = React.useMemo(() => [...modules, ...TOOL_CALCULATORS], [modules]);
  const current = all.find((m) => m.id === active) ?? null;

  // недавно открытые модули — быстрые ссылки в шапке витрины (только в этом браузере)
  const [recent, setRecent] = React.useState<string[]>([]);
  React.useEffect(() => {
    const stored = readStorage<string[]>(STORAGE_KEYS.recentTools, []);
    const next = active ? [active, ...stored.filter((id) => id !== active)].slice(0, 4) : stored;
    if (active) writeStorage(STORAGE_KEYS.recentTools, next);
    setRecent(next);
  }, [active]);
  const recentModules = recent.map((id) => all.find((m) => m.id === id)).filter((m): m is ToolModule => Boolean(m));

  React.useEffect(() => {
    if (active !== "facility" || facility) return;
    recipeApi
      .list("facility")
      .then(setFacility)
      .catch((err) => notify({ title: t("tools.recipes"), message: errorText(err, t("tools.recipesFailed")), tone: "danger" }));
  }, [active, facility, notify, t]);

  React.useEffect(() => {
    if (!active || !["factory", "mpf", "refinery"].includes(active) || recipes) return;
    Promise.all([recipeApi.list("factory"), recipeApi.list("refinery")])
      .then(([factory, refinery]) => setRecipes({ factory, refinery }))
      .catch((err) => notify({ title: t("tools.recipes"), message: errorText(err, t("tools.recipesFailed")), tone: "danger" }));
  }, [active, recipes, notify, t]);

  const loading = <div className="panel"><Loading label={t("tools.loading")} /></div>;
  const body = (() => {
    if (!current) return null;
    if (current.render) return current.render();
    if (current.id === "facility") return facility ? <FacilityCalculator recipes={facility} canSend={canSendOrders} onSent={onOrderSent} /> : loading;
    if (!recipes) return loading;
    if (current.id === "refinery") return <RefineryCalculator recipes={recipes.refinery} />;
    return <FactoryCalculator facility={current.id as "factory" | "mpf"} recipes={recipes.factory} />;
  })();

  // открыт модуль: компактная полоса переключения + сам модуль
  if (current) {
    return (
      <div className="tab-fade tools-page">
        <nav data-guide="tools-tabs" className="tools-switcher panel" aria-label={t("tools.clanTools")}>
          <button type="button" className="btn tools-back" onClick={() => onOpen(null)}>← {t("tools.allTools")}</button>
          <div className="tools-switcher-list scroll-area" role="tablist">
            {all.map((m) => (
              <button key={m.id} type="button" role="tab" aria-selected={m.id === current.id} className={cn("tools-switch", m.id === current.id && "is-active")} onClick={() => onOpen(m.id)}>
                <UiGlyph icon={m.icon} size={22} />
                <span>{t(m.label)}</span>
              </button>
            ))}
          </div>
        </nav>
        <div role="tabpanel" className="min-w-0">{body}</div>
      </div>
    );
  }

  const cardOf = (m: ToolModule, featured: boolean) => (
    <button key={m.id} type="button" className={cn("tool-card", featured && "is-featured")} onClick={() => onOpen(m.id)}>
      <span className="tool-card-top">
        <span className="tool-card-icon"><UiGlyph icon={m.icon} size={featured ? 30 : 26} /></span>
        <span className="tool-card-badges">
          {m.isNew ? <span className="tool-badge is-new">{t("tools.badgeNew")}</span> : null}
          {m.clanData ? <span className="tool-badge is-clan">{t("tools.badgeClan")}</span> : null}
        </span>
      </span>
      <span className="tool-card-title">{t(m.label)}</span>
      <span className="tool-card-tagline">{t(card(m.id, "tagline"))}</span>
      <span className="tool-card-features">
        {(["f1", "f2", "f3"] as const).map((f) => (
          <span key={f}>{t(card(m.id, f))}</span>
        ))}
      </span>
      <span className="tool-card-cta">{t("tools.open")}</span>
    </button>
  );

  return (
    <div className="tab-fade tools-page">
      <section className="panel tools-hero">
        <div className="min-w-0">
          <div className="page-eyebrow">{t("home.eyebrow")}</div>
          <h1 className="tools-hero-title">{userName ? t("home.hello", { name: userName }) : t("home.helloGuest")}</h1>
          <p className="tools-hero-sub">{t("tools.heroSubtitle")}</p>
        </div>
        {recentModules.length ? (
          <div className="tools-hero-recent">
            <span className="tools-hero-recent-label">{t("home.recent")}</span>
            <div className="flex flex-wrap gap-2">
              {recentModules.map((m) => (
                <button key={m.id} type="button" className="recent-chip" onClick={() => onOpen(m.id)}>
                  <UiGlyph icon={m.icon} size={18} />
                  {t(m.label)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="tools-hero-stats">
            <span><b>{all.length}</b>{t("tools.statModules")}</span>
            <span><b>{LOCALES.length}</b>{t("tools.statLanguages")}</span>
            <span><b>Wiki</b>{t("tools.statData")}</span>
          </div>
        )}
      </section>

      {welcome}
      {summary}

      <section data-guide="tools-modules" className="tools-group" aria-labelledby="tools-logistics">
        <h2 id="tools-logistics" className="tools-group-title">{t("tools.groupLogistics")}</h2>
        <div className="tools-showcase">{modules.map((m, i) => cardOf(m, i < 2))}</div>
      </section>

      <section className="tools-group" aria-labelledby="tools-calculators">
        <h2 id="tools-calculators" className="tools-group-title">{t("tools.groupCalculators")}</h2>
        <div className="tools-showcase is-compact">{TOOL_CALCULATORS.map((m) => cardOf(m, false))}</div>
      </section>

      {external.length ? (
        <section className="tools-external">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 data-guide="tools-external" className="tools-group-title">{t("tools.thirdParty")}</h2>
            <span className="text-sm text-fg-3">{t("tools.externalHint")}</span>
          </div>
          <div className="external-tools-grid mt-3">
            {external.map(({ key, payload }) => (
              <a key={key} className="external-tool-card" href={payload.url} target="_blank" rel="noreferrer" title={payload.description}>
                <span className="external-tool-icon" aria-hidden>{payload.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="external-tool-name">{payload.name}</span>
                  <span className="external-tool-tag">{payload.tag}</span>
                </span>
                <span className="external-tool-arrow" aria-hidden>↗</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};
