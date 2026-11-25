"use client";

import * as React from "react";
import { Icon, cn, useT } from "@/shared";
import type { MapRegion } from "@/features/planning/model/map";

/** Search live map labels without requesting building details or changing region selection. */
export const RegionSearch: React.FC<{
  regions: MapRegion[];
  onNavigate: (region: MapRegion) => void;
}> = ({ regions, onNavigate }) => {
  const t = useT();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listId = React.useId();
  const matches = React.useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return [];
    return regions.flatMap((region) => {
      const name = region.name.toLocaleLowerCase();
      const label = region.labels.find((entry) => entry.text.toLocaleLowerCase().includes(term));
      if (!name.includes(term) && !label) return [];
      return [{ region, label: label?.text ?? region.name }];
    }).slice(0, 8);
  }, [query, regions]);

  const choose = (index: number) => {
    const result = matches[index];
    if (!result) return;
    onNavigate(result.region);
    setQuery("");
    setActive(0);
  };

  return (
    <div data-guide="planning-region-search" className="planning-region-search">
      <Icon name="search" size={15} />
      <input
        type="search"
        role="combobox"
        aria-label={t("planning.searchRegion")}
        aria-autocomplete="list"
        aria-expanded={Boolean(query.trim())}
        aria-controls={listId}
        aria-activedescendant={matches[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setActive(0); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && matches.length) { event.preventDefault(); setActive((index) => (index + 1) % matches.length); }
          if (event.key === "ArrowUp" && matches.length) { event.preventDefault(); setActive((index) => (index - 1 + matches.length) % matches.length); }
          if (event.key === "Enter" && matches.length) { event.preventDefault(); choose(active); }
          if (event.key === "Escape") setQuery("");
        }}
        placeholder={t("planning.searchRegion")}
      />
      {query.trim() ? (
        <ul id={listId} className="planning-region-search-results" role="listbox" aria-label={t("planning.searchResults")}>
          {matches.length ? matches.map(({ region, label }, index) => (
            <li key={region.key} role="none">
              <button type="button" role="option" id={`${listId}-${index}`} aria-selected={active === index} className={cn(active === index && "is-active")} onMouseEnter={() => setActive(index)} onClick={() => choose(index)}>
                <span>{label}</span><small>{region.name}</small>
              </button>
            </li>
          )) : <li className="planning-region-search-empty" role="status">{t("planning.searchNoResults")}</li>}
        </ul>
      ) : null}
    </div>
  );
};
