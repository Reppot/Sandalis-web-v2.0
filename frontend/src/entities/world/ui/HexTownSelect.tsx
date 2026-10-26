"use client";

import * as React from "react";
import { Field, Select, useT, type MessageKey } from "@/shared";
import { findRegion, useWorld, type Town } from "@/entities/world/model";

/** Для чего выбирается город: заводу важны постройки производства, бункеру — крупные города. */
export type TownPurpose = "factory" | "bunker";

const PRODUCTION = ["factory", "mpf", "refinery"];
const FACILITY_LABEL: Record<string, MessageKey> = {
  factory: "world.fac.factory",
  mpf: "world.fac.mpf",
  refinery: "world.fac.refinery",
  storage: "world.fac.storage",
  seaport: "world.fac.seaport",
};

function townsFor(towns: Town[], purpose: TownPurpose): Town[] {
  const rank = (t: Town) =>
    purpose === "factory"
      ? t.facilities.some((f) => PRODUCTION.includes(f)) ? 0 : t.major ? 1 : 2
      : t.major ? 0 : 1;
  return [...towns].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/**
 * Гекс и город из списков текущей войны (War API). Без справочника (War API недоступен) —
 * гекс из списка реестра контента и город текстом.
 */
export const HexTownSelect: React.FC<{
  region: string;
  town: string;
  onRegion: (v: string) => void;
  onTown: (v: string) => void;
  purpose: TownPurpose;
  fallbackRegions: string[];
}> = ({ region, town, onRegion, onTown, purpose, fallbackRegions }) => {
  const t = useT();
  const { world } = useWorld();
  const regions = React.useMemo(
    () => [...(world ? world.regions.map((r) => r.name) : fallbackRegions)].sort((a, b) => a.localeCompare(b)),
    [world, fallbackRegions],
  );
  const towns = React.useMemo(() => townsFor(findRegion(world, region)?.towns ?? [], purpose), [world, region, purpose]);

  const tag = (tw: Town) => {
    const facilities = tw.facilities.filter((f) => FACILITY_LABEL[f] && (purpose === "factory" ? PRODUCTION.includes(f) : true)).map((f) => t(FACILITY_LABEL[f]));
    return [tw.major ? null : t("world.minor"), ...facilities].filter(Boolean).join(", ");
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select
        label={t("world.hex")}
        value={region}
        onChange={(e) => {
          onRegion(e.target.value);
          onTown("");
        }}
        className="h-11"
      >
        <option value="">{t("world.pickHex")}</option>
        {regions.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </Select>
      {world && towns.length ? (
        <Select label={t("world.town")} value={town} onChange={(e) => onTown(e.target.value)} disabled={!region} className="h-11">
          <option value="">{t("world.pickTown")}</option>
          {towns.map((tw) => {
            const note = tag(tw);
            return (
              <option key={tw.name} value={tw.name}>
                {note ? `${tw.name} — ${note}` : tw.name}
              </option>
            );
          })}
        </Select>
      ) : (
        <Field label={t("world.town")} value={town} onChange={(e) => onTown(e.target.value)} placeholder={region ? t("world.townFree") : t("world.pickHexFirst")} disabled={!region} className="h-11" />
      )}
    </div>
  );
};
