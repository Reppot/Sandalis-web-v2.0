"use client";

import * as React from "react";
import { useContent, type ExternalToolPayload } from "@/entities/content";
import { recipeApi, type Recipe } from "@/entities/recipe";
import { Loading, errorText, UiGlyph, cn, useNotify, useT, type MessageKey, type UiIcon } from "@/shared";
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

const CALCULATORS: ToolModule[] = [
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
}> = ({ modules, active, onOpen, canSendOrders, onOrderSent }) => {
  const notify = useNotify();
  const t = useT();
  const { list } = useContent();
  const [recipes, setRecipes] = React.useState<{ factory: Recipe[]; refinery: Recipe[] } | null>(null);
  // рецепты построек (~350) грузятся только при открытии калькулятора завода
  const [facility, setFacility] = React.useState<Recipe[] | null>(null);
  const external = list<ExternalToolPayload>("external_tool");
  const all = React.useMemo(() => [...modules, ...CALCULATORS], [modules]);
  const current = all.find((m) => m.id === active) ?? null;

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

  const loading = <div className="panel rounded-md"><Loading label={t("tools.loading")} /></div>;
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
        <nav data-guide="tools-tabs" className="tools-switcher panel panel-corners" aria-label={t("tools.clanTools")}>
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

  return (
    <div className="tab-fade tools-page">
      <section className="panel panel-corners tools-hero">
        <div className="min-w-0">
          <div className="hud-label text-accent">SINDARIS FIELD UTILITIES</div>
          <h1 className="tools-hero-title">{t("tools.heroTitle")}</h1>
          <p className="tools-hero-sub">{t("tools.heroSubtitle")}</p>
        </div>
        <div className="tools-hero-stats">
          <span><b>{all.length}</b>{t("tools.statModules")}</span>
          <span><b>3</b>{t("tools.statLanguages")}</span>
          <span><b>WIKI</b>{t("tools.statData")}</span>
        </div>
      </section>

      <section data-guide="tools-modules" className="tools-showcase">
        {all.map((m, i) => (
          <button key={m.id} type="button" className={cn("tool-card", i < 2 && "is-featured")} onClick={() => onOpen(m.id)}>
            <span className="tool-card-top">
              <span className="tool-card-icon"><UiGlyph icon={m.icon} size={i < 2 ? 64 : 52} /></span>
              <span className="tool-card-badges">
                {m.isNew ? <span className="tool-badge is-new">{t("tools.badgeNew")}</span> : null}
                {m.clanData ? <span className="tool-badge is-clan">{t("tools.badgeClan")}</span> : null}
              </span>
            </span>
            <span className="tool-card-title">{t(m.label)}</span>
            <span className="tool-card-tagline">{t(card(m.id, "tagline"))}</span>
            <span className="tool-card-features">
              {(["f1", "f2", "f3"] as const).map((f) => (
                <span key={f}>✔ {t(card(m.id, f))}</span>
              ))}
            </span>
            <span className="tool-card-cta">{t("tools.open")} →</span>
          </button>
        ))}
      </section>

      {external.length ? (
        <section className="tools-external">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 data-guide="tools-external" className="hud-label text-muted">🔗 {t("tools.thirdParty")} • {t("tools.links", { n: external.length })}</h2>
            <span className="hud-label text-muted">{t("tools.externalHint")}</span>
          </div>
          <div className="external-tools-grid is-compact mt-2">
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
