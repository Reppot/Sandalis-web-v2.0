"use client";

import * as React from "react";
import { apiClient, assetUrl } from "@/shared";

/** Запись реестра контента (GET /api/v1/content). payload — по виду записи. */
export interface ContentEntry<P = Record<string, unknown>> {
  kind: string;
  key: string;
  sort: number;
  is_active: boolean;
  payload: P;
}

export interface MediaPayload {
  type: "image" | "video";
  url: string;
  poster?: string;
}
export interface LabelPayload {
  label: string;
  name_en?: string;
  icon?: string | null;
}
export interface ExternalToolPayload {
  name: string;
  url: string;
  tag: string;
  icon: string;
  description: string;
}
export interface TrainingModulePayload {
  title: string;
  status: "ready" | "wip";
  icon: string;
  summary: string;
  body: string[];
}

export interface ContentState {
  loading: boolean;
  entries: ContentEntry[];
  /** Абсолютный URL медиа по ключу (bg_orders, login_video, clan_logo…). */
  media: (key: string) => string | null;
  mediaEntry: (key: string) => MediaPayload | null;
  list: <P>(kind: string) => ContentEntry<P>[];
  /** Подпись по виду и ключу (категории, материалы), иначе сам ключ. */
  label: (kind: string, key: string) => string;
  labelIcon: (kind: string, key: string) => string | null;
}

const ContentContext = React.createContext<ContentState | null>(null);

/**
 * Контент грузится один раз на вкладку браузера: он публичный (нужен экрану входа
 * до авторизации) и меняется редко. Всё, что раньше было статикой фронта, — отсюда.
 */
export const ContentProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [entries, setEntries] = React.useState<ContentEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    apiClient
      .get<ContentEntry[]>("/api/v1/content")
      .then((rows) => !cancelled && setEntries(rows))
      .catch(() => !cancelled && setEntries([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const value = React.useMemo<ContentState>(() => {
    const index = new Map(entries.map((e) => [`${e.kind}:${e.key}`, e]));
    const byKind = new Map<string, ContentEntry[]>();
    for (const e of entries) byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e]);
    const mediaEntry = (key: string) => (index.get(`media:${key}`)?.payload as MediaPayload | undefined) ?? null;
    return {
      loading,
      entries,
      mediaEntry,
      media: (key) => assetUrl(mediaEntry(key)?.url),
      list: <P,>(kind: string) => (byKind.get(kind) ?? []) as ContentEntry<P>[],
      label: (kind, key) => (index.get(`${kind}:${key}`)?.payload as LabelPayload | undefined)?.label ?? key,
      labelIcon: (kind, key) => assetUrl((index.get(`${kind}:${key}`)?.payload as LabelPayload | undefined)?.icon),
    };
  }, [entries, loading]);

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
};

export function useContent(): ContentState {
  const ctx = React.useContext(ContentContext);
  if (!ctx) throw new Error("useContent must be used within ContentProvider");
  return ctx;
}
