"use client";

import * as React from "react";
import { ROMAN, useBadge, type SeasonTitle, type Tier } from "@/features/stats/model/game";
import { useT, type MessageKey } from "@/shared";

/** Цвета вымпела: заливка, кайма, камень, текст. Свои SVG — без эмблем из игр. */
const COLORS: Record<Tier | SeasonTitle, [string, string, string, string]> = {
  iron: ["#5F5E5A", "#444441", "#B4B2A9", "#F1EFE8"],
  bronze: ["#993C1D", "#712B13", "#F0997B", "#FAECE7"],
  silver: ["#888780", "#D3D1C7", "#F1EFE8", "#2C2C2A"],
  gold: ["#BA7517", "#FAC775", "#FAC775", "#412402"],
  platinum: ["#0F6E56", "#5DCAA5", "#9FE1CB", "#E1F5EE"],
  emerald: ["#3B6D11", "#97C459", "#C0DD97", "#EAF3DE"],
  diamond: ["#185FA5", "#B5D4F4", "#E6F1FB", "#E6F1FB"],
  master: ["#534AB7", "#CECBF6", "#EEEDFE", "#EEEDFE"],
  grandmaster: ["#A32D2D", "#F7C1C1", "#FCEBEB", "#FCEBEB"],
  challenger: ["#26215C", "#EF9F27", "#FAC775", "#FAC775"],
};
const RANK = (t: Tier | SeasonTitle) => (["iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master", "grandmaster", "challenger"] as const).indexOf(t);

const PLAIN = "M10 4h44v58L32 78 10 62z";
const CREST = "M10 10l6-8 6 6 10-6 10 6 6-6 6 8v52L32 78 10 62z";
const CROWN = "M11 10l5-9 5 7 6-8 5 8 5-8 6 8 5-7 5 9v52L32 78 11 62z";

/**
 * Мини-баннер лиги: форма и украшения растут с лигой (ветви, кайма, крылья, гребень, камень,
 * корона), ступень IV–I — на вымпеле. Титул сезона (Грандмастер / Претендент) заменяет лигу.
 */
export const LeagueBanner: React.FC<{ tier: Tier; division?: number | null; title?: SeasonTitle | null; size?: number; className?: string }> = ({ tier, division, title, size = 20, className }) => {
  const t = useT();
  const kind = title ?? tier;
  const [fill, edge, gem, ink] = COLORS[kind];
  const r = RANK(kind);
  const label = title ? t(`game.title.${title}` as MessageKey) : `${t(`game.tier.${tier}` as MessageKey)}${division ? ` ${ROMAN[division]}` : ""}`;
  const big = size >= 40;
  return (
    <svg width={size * 0.76} height={size} viewBox="0 0 64 84" className={className} role="img" aria-label={label}>
      <title>{label}</title>
      {r >= 6 ? <path d="M1 16l10 7M63 16l-10 7M2 27l9 2M62 27l-9 2" stroke={edge} strokeWidth="3" /> : r === 3 ? <path d="M2 16l10 6M62 16l-10 6" stroke={edge} strokeWidth="3" /> : null}
      <path d={r >= 6 ? CROWN : r >= 4 ? CREST : PLAIN} fill={fill} stroke={edge} strokeWidth={big ? 2 : 3} />
      {r === 1 ? <path d="M14 66c-6-6-8-14-6-22M50 66c6-6 8-14 6-22" stroke={gem} strokeWidth="3" fill="none" /> : null}
      {r === 2 && big ? <path d="M15 9h34v50L32 71 15 59z" fill="none" stroke={gem} strokeWidth="1.5" /> : null}
      {kind === "grandmaster" || kind === "challenger" ? (
        <path d="M19 40l3-16 5 8 5-12 5 12 5-8 3 16z" fill={gem} />
      ) : kind === "master" ? (
        <path d="M32 21l3.5 7 7.5 1-5.5 5.5 1.5 7.5-7-3.5-7 3.5 1.5-7.5-5.5-5.5 7.5-1z" fill={gem} />
      ) : kind === "emerald" ? (
        <path d="M32 16l14 8v16l-14 8-14-8V24z" fill={gem} />
      ) : kind === "diamond" ? (
        <path d="M32 16l14 10-14 22-14-22z" fill={gem} />
      ) : (
        <path d="M32 18l12 13-12 13-12-13z" fill={gem} />
      )}
      {big ? (
        <text x="32" y="62" textAnchor="middle" fontSize="11" fill={ink}>
          {title === "challenger" ? "№1" : title === "grandmaster" ? "TOP 5" : division ? ROMAN[division] : ""}
        </text>
      ) : null}
    </svg>
  );
};

/** Значок лиги у ника (данные — общий кэш значков клана). Нет очков — ничего не рисуем. */
export const LeagueMark: React.FC<{ userId: string | null | undefined; size?: number }> = ({ userId, size = 16 }) => {
  const badge = useBadge(userId);
  if (!badge) return null;
  return <LeagueBanner tier={badge.tier} division={badge.division} title={badge.title} size={size} className="league-mark" />;
};
