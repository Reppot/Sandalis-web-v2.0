"use client";

import * as React from "react";
import { useContent, type ExternalToolPayload } from "@/entities/content";
import { recipeApi, type Recipe } from "@/entities/recipe";
import { Loading, errorText, uiIcon, useNotify, type UiIcon } from "@/shared";
import { FactoryCalculator } from "@/features/tools/ui/FactoryCalculator";
import { RefineryCalculator } from "@/features/tools/ui/RefineryCalculator";

type ClanToolId = "factory" | "mpf" | "refinery";

const CLAN_TOOLS: { id: ClanToolId; label: string; hint: string; icon: UiIcon }[] = [
  { id: "factory", label: "Калькулятор фабрики", hint: "Factory • очередь, лимиты, материалы", icon: "business" },
  { id: "mpf", label: "MPF", hint: "Mass Production Factory • скидка за партию", icon: "conveyor-belt" },
  { id: "refinery", label: "Калькулятор молотка (Refinery)", hint: "Сырьё → материалы • время переработки", icon: "pallets" },
];

/** «Инструменты»: калькуляторы клана на рецептах сервера + проверенные внешние сервисы. */
export const ToolsWorkspace: React.FC = () => {
  const notify = useNotify();
  const { list } = useContent();
  const [active, setActive] = React.useState<ClanToolId | null>(null);
  const [recipes, setRecipes] = React.useState<{ factory: Recipe[]; refinery: Recipe[] } | null>(null);
  const external = list<ExternalToolPayload>("external_tool");

  React.useEffect(() => {
    if (!active || recipes) return;
    Promise.all([recipeApi.list("factory"), recipeApi.list("refinery")])
      .then(([factory, refinery]) => setRecipes({ factory, refinery }))
      .catch((err) => notify({ title: "РЕЦЕПТЫ", message: errorText(err, "Рецепты недоступны"), tone: "danger" }));
  }, [active, recipes, notify]);

  return (
    <div className="tab-fade tools-page">
      <section className="panel panel-corners tools-header">
        <div className="flex min-w-0 items-center gap-3">
          <span className="tools-signal" aria-hidden />
          <div className="min-w-0">
            <div className="hud-label text-muted">SINDARIS FIELD UTILITIES</div>
            <h1 className="panel-title mt-1 text-[1.05rem] md:text-[1.3rem]">▣ Инструменты</h1>
            <p className="mt-1 text-sm text-white/70">Калькуляторы клана и проверенные внешние сервисы Foxhole.</p>
          </div>
        </div>
        <span className="tools-header-status">
          <span className="status-dot" /> {CLAN_TOOLS.length} МОДУЛЯ • {external.length} ССЫЛОК
        </span>
      </section>

      <nav className="panel panel-corners rounded-md p-2.5" aria-label="Инструменты клана">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
          <span className="hud-label text-accent">ИНСТРУМЕНТЫ КЛАНА</span>
          {active ? (
            <button type="button" className="btn btn-danger px-2 py-1" onClick={() => setActive(null)}>✕ Сбросить выбор</button>
          ) : (
            <span className="hud-label text-muted">Выберите вкладку</span>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
          {CLAN_TOOLS.map((tool) => {
            const on = tool.id === active;
            return (
              <button
                key={tool.id}
                type="button"
                role="tab"
                aria-selected={on}
                className={`btn h-auto min-h-[58px] min-w-[13.5rem] flex-1 justify-start gap-3 px-3 py-2 text-left whitespace-normal ${on ? "btn-active" : ""}`}
                onClick={() => setActive(on ? null : tool.id)}
                title={on ? "Повторный клик сбрасывает выбор" : tool.hint}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={uiIcon(tool.icon)} alt="" width={36} height={36} className="ui-icon h-9 w-9 shrink-0 object-contain" />
                <span className="min-w-0">
                  <span className={`block text-[0.78rem] ${on ? "text-accent" : "text-white"}`}>{tool.label}</span>
                  <span className="mt-1 block text-[0.62rem] font-normal tracking-normal text-white/60 normal-case">{tool.hint}</span>
                </span>
                {on ? <span className="status-dot ml-auto shrink-0" style={{ color: "var(--accent)", background: "var(--accent)" }} aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </nav>

      {active ? (
        <div role="tabpanel" className="min-w-0">
          {!recipes ? (
            <div className="panel rounded-md"><Loading label="📡 ЗАГРУЗКА РЕЦЕПТОВ..." /></div>
          ) : active === "refinery" ? (
            <RefineryCalculator recipes={recipes.refinery} />
          ) : (
            <FactoryCalculator facility={active} recipes={recipes.factory} />
          )}
        </div>
      ) : (
        <section className="panel panel-corners rounded-md p-4">
          <div className="flex items-center gap-2">
            <span className="hud-label text-accent">СТОРОННИЕ РЕСУРСЫ</span>
            <span className="badge-count min-w-0 px-2">{external.length} ССЫЛОК</span>
          </div>
          <h2 className="panel-title mt-1 text-[0.95rem]">🔗 Внешние инструменты клана</h2>
          <p className="mt-1 text-[0.8rem] text-white/65">Проверенные сторонние сервисы для карты, планирования баз, артиллерии и воздушного боя.</p>
          <div className="external-tools-grid mt-3">
            {external.map(({ key, payload }) => (
              <a key={key} className="external-tool-card" href={payload.url} target="_blank" rel="noreferrer">
                <span className="external-tool-icon" aria-hidden>{payload.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="external-tool-tag">{payload.tag}</span>
                  <span className="external-tool-name">{payload.name}</span>
                  <span className="external-tool-desc">{payload.description}</span>
                </span>
                <span className="external-tool-arrow" aria-hidden>↗</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
