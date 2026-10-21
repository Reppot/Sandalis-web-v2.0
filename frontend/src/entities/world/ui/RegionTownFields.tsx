"use client";

import * as React from "react";
import { Field, useT } from "@/shared";
import { findRegion, townsForStockpile, useWorld } from "@/entities/world/model";

/**
 * Регион + место (город) для складов и таймеров: регионы текущей войны из War API,
 * подсказки мест — города выбранного региона (сначала с депо и портом).
 * Если War API недоступен — регионы из старого списка (fallback).
 */
export const RegionTownFields: React.FC<{
  region: string;
  onRegion: (value: string) => void;
  town: string;
  onTown: (value: string) => void;
  regionLabel: string;
  townLabel: string;
  townPlaceholder?: string;
  fallbackRegions: string[];
  onEnter?: () => void;
}> = ({ region, onRegion, town, onTown, regionLabel, townLabel, townPlaceholder, fallbackRegions, onEnter }) => {
  const t = useT();
  const { world } = useWorld();
  const regionsId = React.useId();
  const townsId = React.useId();
  const regionNames = world ? world.regions.map((r) => r.name) : fallbackRegions;
  const towns = townsForStockpile(findRegion(world, region));
  const tag = (f: string[]) => [f.includes("storage") ? `📦 ${t("world.fac.storage")}` : "", f.includes("seaport") ? `⚓ ${t("world.fac.seaport")}` : ""].filter(Boolean).join(" • ");

  return (
    <>
      <Field label={regionLabel} list={regionsId} value={region} onChange={(e) => onRegion(e.target.value)} placeholder="The Moors" autoFocus />
      <datalist id={regionsId}>
        {regionNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <Field
        label={towns.length ? `${townLabel} • ${t("world.townsHint", { n: towns.length })}` : townLabel}
        list={townsId}
        value={town}
        onChange={(e) => onTown(e.target.value)}
        placeholder={townPlaceholder ?? towns[0]?.name ?? "Port Kirknell"}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      />
      <datalist id={townsId}>
        {towns.map((tw) => (
          <option key={tw.name} value={tw.name} label={tag(tw.facilities) || (tw.major ? t("world.major") : t("world.minor"))} />
        ))}
      </datalist>
    </>
  );
};
